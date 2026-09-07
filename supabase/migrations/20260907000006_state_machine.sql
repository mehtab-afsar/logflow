-- ═══════════════════════════════════════════════════════════════════════════
-- 06 · Lifecycle: transitions, immutable events, trip tokens
--
-- WHY: "the truck was unloaded", "a clean POD is in hand" and "it has been
-- billed" are three different facts, and an ops team needs to tell them apart.
-- The status column encodes that, and this migration makes it impossible for
-- the column to move without leaving an audit trail.
--
-- THE CENTRAL GUARANTEE: consignment_events has RLS enabled and ZERO policies,
-- and INSERT/UPDATE/DELETE are revoked from authenticated. The only writer is
-- _apply_transition(), which is SECURITY DEFINER and therefore bypasses RLS.
-- Since that function always writes the event row in the same statement block
-- as the status update, and both share one implicit transaction, there is no
-- path by which a status changes without its event.
--
-- settled → cancelled is deliberately absent. Once money has moved you reverse
-- it with a credit note, not by cancelling the consignment. The PRD left this
-- ambiguous; this is the decision.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- The legal edges, as data. lib/consignments/state-machine.ts mirrors this and
-- __tests__/state-machine-parity.test.ts asserts the two agree.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.consignment_transitions (
  from_status text not null,
  to_status   text not null,
  primary key (from_status, to_status)
);

insert into public.consignment_transitions (from_status, to_status) values
  ('draft',        'dispatched'),
  ('dispatched',   'in_transit'),
  ('in_transit',   'delivered'),
  ('delivered',    'pod_verified'),
  ('pod_verified', 'invoiced'),
  ('invoiced',     'settled'),
  ('draft',        'cancelled'),
  ('dispatched',   'cancelled'),
  ('in_transit',   'cancelled'),
  ('delivered',    'cancelled'),
  ('pod_verified', 'cancelled'),
  ('invoiced',     'cancelled')
on conflict (from_status, to_status) do nothing;

comment on table public.consignment_transitions is
  'Legal status edges. Data, not code, so the RPC re-reads it rather than trusting the caller.';

alter table public.consignment_transitions enable row level security;
revoke all on public.consignment_transitions from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Immutable event log.
--
-- event_time is caller-supplied and may be BACK-dated (a dispatcher recording
-- yesterday's delivery). created_at is always the real insert instant and
-- nothing can update it. The check allows an hour of forward slack for clock
-- skew, but no genuine future-dating.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.consignment_events (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organisations(id) on delete cascade,
  consignment_id uuid not null references public.consignments(id) on delete cascade,
  kind           text not null default 'status_change'
                 constraint consignment_events_kind_chk
                 check (kind in ('status_change', 'milestone', 'note', 'pod_uploaded', 'expense_added')),
  from_status    text,
  to_status      text,
  milestone      text
                 constraint consignment_events_milestone_chk
                 check (milestone is null or milestone in ('loaded', 'departed', 'reached', 'unloaded')),
  event_time     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  location_name  text,
  remarks        text,
  payload        jsonb not null default '{}'::jsonb,
  actor_type     text not null
                 constraint consignment_events_actor_chk
                 check (actor_type in ('driver', 'staff', 'system')),
  actor_user_id  uuid references public.profiles(id) on delete set null,
  constraint consignment_events_not_future_chk
    check (event_time <= created_at + interval '1 hour')
);

create index if not exists consignment_events_consignment_time_idx
  on public.consignment_events (consignment_id, event_time desc);
create index if not exists consignment_events_org_time_idx
  on public.consignment_events (org_id, event_time desc);

comment on table public.consignment_events is
  'Append-only audit trail. RLS on with zero write policies: only SECURITY DEFINER functions write here.';
comment on column public.consignment_events.event_time is
  'When it happened (back-datable). created_at is when it was recorded and is never updatable.';

alter table public.consignment_events enable row level security;

drop policy if exists "consignment_events_select" on public.consignment_events;
create policy "consignment_events_select" on public.consignment_events
  for select to authenticated using (org_id = (select public.current_org_id()));

-- Read-only for every client role. The definer functions bypass this.
revoke all           on public.consignment_events from anon;
revoke insert, update, delete on public.consignment_events from authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Trip access tokens (driver links).
--
-- Isolated in a table no client role can read. The raw token is stored rather
-- than a hash so a dispatcher can RE-SHARE a link the driver lost; hashing
-- would force a re-mint and invalidate the link already sitting in the
-- driver's WhatsApp thread. Exposure is controlled by making the table
-- unreachable and gating retrieval behind an owner/dispatcher RPC.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.access_tokens (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organisations(id) on delete cascade,
  consignment_id uuid not null references public.consignments(id) on delete cascade,
  kind           text not null default 'driver'
                 constraint access_tokens_kind_chk check (kind in ('driver')),
  token          text not null default encode(extensions.gen_random_bytes(20), 'hex'),
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid references public.profiles(id) on delete set null
);

create unique index if not exists access_tokens_token_uniq on public.access_tokens (token);
create index if not exists access_tokens_consignment_idx
  on public.access_tokens (consignment_id) where revoked_at is null;

comment on table public.access_tokens is
  '20-byte driver-link tokens. Deny-all: reachable only through SECURITY DEFINER functions.';

alter table public.access_tokens enable row level security;
revoke all on public.access_tokens from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- LR number allocation, as a BEFORE INSERT trigger.
--
-- Allocating in the route handler and then inserting would be two
-- transactions, and a crash between them burns a number. Doing it in the
-- trigger makes allocation and insert one statement, so the rollback that
-- undoes the insert also rewinds the counter.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.assign_lr_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lr_no is null or btrim(new.lr_no) = '' then
    new.lr_no := public.next_doc_number(new.branch_id, 'LR', new.lr_date);
  end if;
  return new;
end;
$$;

revoke execute on function public.assign_lr_number() from public;

drop trigger if exists consignments_assign_lr_number on public.consignments;
create trigger consignments_assign_lr_number
  before insert on public.consignments
  for each row execute function public.assign_lr_number();

-- ───────────────────────────────────────────────────────────────────────────
-- Bump doc_version whenever anything that appears on the printed LR changes.
-- The cached PDF path embeds doc_version, so this makes cache invalidation
-- automatic rather than something a developer must remember.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.bump_doc_version()
returns trigger
language plpgsql
as $$
begin
  if (new.lr_no, new.lr_date, new.consignor_snapshot, new.consignee_snapshot,
      new.origin_city, new.destination_city, new.cargo_description,
      new.packages_count, new.actual_weight_kg, new.charged_weight_kg,
      new.declared_value, new.freight, new.loading, new.unloading,
      new.detention, new.other_charges, new.ewb_no, new.vehicle_id,
      new.driver_id, new.freight_terms, new.status)
     is distinct from
     (old.lr_no, old.lr_date, old.consignor_snapshot, old.consignee_snapshot,
      old.origin_city, old.destination_city, old.cargo_description,
      old.packages_count, old.actual_weight_kg, old.charged_weight_kg,
      old.declared_value, old.freight, old.loading, old.unloading,
      old.detention, old.other_charges, old.ewb_no, old.vehicle_id,
      old.driver_id, old.freight_terms, old.status)
  then
    new.doc_version := old.doc_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists consignments_bump_doc_version on public.consignments;
create trigger consignments_bump_doc_version
  before update on public.consignments
  for each row execute function public.bump_doc_version();

-- ───────────────────────────────────────────────────────────────────────────
-- _apply_transition: the engine. No authentication of its own — callers are
-- responsible for that, because the two callers authenticate differently
-- (a staff session vs a driver token).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._apply_transition(
  p_consignment_id uuid,
  p_to_status      text,
  p_payload        jsonb,
  p_event_time     timestamptz,
  p_actor_type     text,
  p_actor_user_id  uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c            public.consignments;
  v_from       text;
  v_pod_count  integer;
  v_unloaded   integer;
  v_token      text;
  v_advance    numeric;
begin
  -- FOR UPDATE serialises double-clicks and offline-queue retries.
  select * into c from public.consignments where id = p_consignment_id for update;
  if not found then
    raise exception 'consignment not found' using errcode = 'P0002';
  end if;

  v_from := c.status;

  if v_from = p_to_status then
    -- Idempotent no-op: a retried request must not fail or double-write.
    return jsonb_build_object('id', c.id, 'status', c.status, 'unchanged', true);
  end if;

  -- Re-read the legal edge from the database; never trust a client's idea of
  -- what the current status is.
  if not exists (
    select 1 from public.consignment_transitions t
     where t.from_status = v_from and t.to_status = p_to_status
  ) then
    raise exception 'illegal transition % -> %', v_from, p_to_status using errcode = '23514';
  end if;

  -- ─── Preconditions ───
  if p_to_status = 'dispatched' then
    if c.vehicle_id is null or c.driver_id is null then
      raise exception 'a vehicle and a driver are required before dispatch'
        using errcode = '23514';
    end if;
  end if;

  if p_to_status = 'delivered' then
    select count(*) into v_unloaded
      from public.consignment_events e
     where e.consignment_id = c.id and e.milestone = 'unloaded';
    if v_unloaded = 0 and coalesce(p_payload->>'force', 'false') <> 'true' then
      raise exception 'the driver has not marked the truck unloaded'
        using errcode = '23514';
    end if;
  end if;

  if p_to_status = 'pod_verified' then
    select count(*) into v_pod_count
      from public.consignment_pods p where p.consignment_id = c.id;
    if v_pod_count = 0 then
      raise exception 'cannot verify: no proof of delivery has been uploaded'
        using errcode = '23514';
    end if;
  end if;

  if p_to_status = 'invoiced' and c.bill_id is null then
    raise exception 'a consignment becomes invoiced only by being placed on a bill'
      using errcode = '23514';
  end if;

  if p_to_status = 'cancelled'
     and coalesce(btrim(p_payload->>'reason'), '') = '' then
    raise exception 'a reason is required to cancel' using errcode = '23514';
  end if;

  -- ─── Side effects ───
  if p_to_status = 'dispatched' then
    insert into public.access_tokens (org_id, consignment_id, kind, expires_at, created_by)
    values (c.org_id, c.id, 'driver', now() + interval '15 days', p_actor_user_id)
    returning token into v_token;

    v_advance := coalesce((p_payload->>'advance')::numeric, 0);
    if v_advance > 0 then
      insert into public.trip_expenses (org_id, consignment_id, kind, amount, paid_by,
                                        entered_by_type, note, client_id)
      values (c.org_id, c.id, 'advance', v_advance, 'office', 'staff',
              'Advance paid at dispatch', gen_random_uuid());
    end if;
  end if;

  if p_to_status = 'delivered' then
    -- The link stops being useful 72h after delivery.
    update public.access_tokens
       set expires_at = least(expires_at, now() + interval '72 hours')
     where consignment_id = c.id and revoked_at is null;
  end if;

  if p_to_status = 'cancelled' then
    -- A cancelled trip's link dies immediately.
    update public.access_tokens
       set revoked_at = now()
     where consignment_id = c.id and revoked_at is null;
  end if;

  -- ─── The status change ───
  update public.consignments
     set status          = p_to_status,
         cancel_reason   = case when p_to_status = 'cancelled'
                                then btrim(p_payload->>'reason') else cancel_reason end,
         cancelled_at    = case when p_to_status = 'cancelled'    then p_event_time else cancelled_at end,
         dispatched_at   = case when p_to_status = 'dispatched'   then p_event_time else dispatched_at end,
         in_transit_at   = case when p_to_status = 'in_transit'   then p_event_time else in_transit_at end,
         delivered_at    = case when p_to_status = 'delivered'    then p_event_time else delivered_at end,
         pod_verified_at = case when p_to_status = 'pod_verified' then p_event_time else pod_verified_at end,
         pod_verified_by = case when p_to_status = 'pod_verified' then p_actor_user_id else pod_verified_by end,
         invoiced_at     = case when p_to_status = 'invoiced'     then p_event_time else invoiced_at end,
         settled_at      = case when p_to_status = 'settled'      then p_event_time else settled_at end
   where id = c.id;

  -- ─── The event. Same transaction, always. ───
  insert into public.consignment_events (
    org_id, consignment_id, kind, from_status, to_status,
    event_time, location_name, remarks, payload, actor_type, actor_user_id
  ) values (
    c.org_id, c.id, 'status_change', v_from, p_to_status,
    p_event_time, p_payload->>'location', p_payload->>'remarks',
    coalesce(p_payload, '{}'::jsonb), p_actor_type, p_actor_user_id
  );

  return jsonb_build_object(
    'id', c.id,
    'lr_no', c.lr_no,
    'from_status', v_from,
    'status', p_to_status,
    'driver_token', v_token
  );
end;
$$;

revoke execute on function public._apply_transition(uuid, text, jsonb, timestamptz, text, uuid) from public;

comment on function public._apply_transition(uuid, text, jsonb, timestamptz, text, uuid) is
  'Transition engine. Does NOT authenticate — callers must. Always writes an event in the same transaction as the status change.';

-- ───────────────────────────────────────────────────────────────────────────
-- transition_consignment: the staff-facing wrapper. Authenticates, then
-- delegates. This is the ONLY status mutator exposed to a session.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.transition_consignment(
  p_consignment_id uuid,
  p_to_status      text,
  p_payload        jsonb default '{}'::jsonb,
  p_event_time     timestamptz default now()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.current_org_id();
begin
  if v_org is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.consignments c
     where c.id = p_consignment_id and c.org_id = v_org
  ) then
    -- Deliberately "not found", not "forbidden": do not confirm that a
    -- consignment belonging to another organisation exists.
    raise exception 'consignment not found' using errcode = 'P0002';
  end if;

  if p_to_status in ('invoiced', 'settled') then
    if not public.has_role('owner', 'accounts') then
      raise exception 'this action requires the owner or accounts role' using errcode = '42501';
    end if;
  elsif not public.has_role('owner', 'dispatcher', 'accounts') then
    raise exception 'this action requires the owner, dispatcher or accounts role' using errcode = '42501';
  end if;

  if p_event_time > now() + interval '1 hour' then
    raise exception 'an event cannot be dated in the future' using errcode = '23514';
  end if;

  return public._apply_transition(
    p_consignment_id, p_to_status, coalesce(p_payload, '{}'::jsonb),
    p_event_time, 'staff', (select auth.uid())
  );
end;
$$;

revoke execute on function public.transition_consignment(uuid, text, jsonb, timestamptz) from public;
grant  execute on function public.transition_consignment(uuid, text, jsonb, timestamptz) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- get_trip_link: lets a dispatcher re-share a driver link without re-minting
-- (which would invalidate the URL already in the driver's WhatsApp thread).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.get_trip_link(p_consignment_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_token text;
begin
  if not public.has_role('owner', 'dispatcher') then
    raise exception 'this action requires the owner or dispatcher role' using errcode = '42501';
  end if;

  select t.token into v_token
    from public.access_tokens t
    join public.consignments c on c.id = t.consignment_id
   where t.consignment_id = p_consignment_id
     and c.org_id = public.current_org_id()
     and t.revoked_at is null
     and t.expires_at > now()
   order by t.created_at desc
   limit 1;

  return v_token;
end;
$$;

revoke execute on function public.get_trip_link(uuid) from public;
grant  execute on function public.get_trip_link(uuid) to authenticated;

-- Read-only to clients. All writes go through _apply_transition().
grant select on public.consignment_events to authenticated;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop function if exists public.get_trip_link(uuid);
-- drop function if exists public.transition_consignment(uuid, text, jsonb, timestamptz);
-- drop function if exists public._apply_transition(uuid, text, jsonb, timestamptz, text, uuid);
-- drop trigger  if exists consignments_bump_doc_version on public.consignments;
-- drop function if exists public.bump_doc_version();
-- drop trigger  if exists consignments_assign_lr_number on public.consignments;
-- drop function if exists public.assign_lr_number();
-- drop table    if exists public.access_tokens;
-- drop table    if exists public.consignment_events;
-- drop table    if exists public.consignment_transitions;
