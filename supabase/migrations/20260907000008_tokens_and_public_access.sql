-- ═══════════════════════════════════════════════════════════════════════════
-- 08 · Token-scoped public access: customer tracking and the driver portal
--
-- THIS FILE IS THE ENTIRE `anon` ATTACK SURFACE. Four function grants, no
-- table grants at all. Everything below is written on that assumption.
--
-- WHY NOT A PUBLIC RLS POLICY: the obvious approach — a policy allowing SELECT
-- where tracking_token matches — exposes every column of the row to anyone
-- with the link, including freight, advances and both parties' GSTINs. A
-- consignee handed a tracking URL would see what the consignor is paying.
-- Instead there is NO anon-readable table anywhere, and a SECURITY DEFINER
-- function returns a hand-written whitelist projection.
--
-- track_consignment returns exactly ten keys and no others; a repo-guard test
-- (__tests__/tracking-projection.test.ts) fails the build if that set changes
-- or if any money/identity word appears in the function body.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- Shared token validator. Not granted to anybody: internal to the driver RPCs
-- so that expiry and revocation are checked in exactly one place.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.resolve_trip_token(p_token text)
returns table (consignment_id uuid, org_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select t.consignment_id, t.org_id
    from public.access_tokens t
   where t.token = p_token
     and t.revoked_at is null
     and t.expires_at > now()
   limit 1
$$;

revoke execute on function public.resolve_trip_token(text) from public;

comment on function public.resolve_trip_token(text) is
  'Single point of truth for driver-token validity (existence, revocation, expiry). Granted to nobody.';

-- ───────────────────────────────────────────────────────────────────────────
-- PUBLIC TRACKING
--
-- Whitelist projection. Note what is absent: freight, advance, any tax figure,
-- either GSTIN, any phone number, any expense. The driver is identified by
-- first name only.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.track_consignment(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'lr_no',             c.lr_no,
    'lr_date',           c.lr_date,
    'status',            c.status,
    'from_city',         c.origin_city,
    'to_city',           c.destination_city,
    'vehicle_no',        v.reg_number,
    'driver_first_name', split_part(d.full_name, ' ', 1),
    'eta_text',          c.eta_text,
    'pod_path',          (select p.storage_path
                            from public.consignment_pods p
                           where p.consignment_id = c.id
                           order by p.page_no asc
                           limit 1),
    'events',            (select coalesce(jsonb_agg(jsonb_build_object(
                                   'at',        e.event_time,
                                   'status',    e.to_status,
                                   'milestone', e.milestone,
                                   'kind',      e.kind,
                                   'place',     e.location_name
                                 ) order by e.event_time asc), '[]'::jsonb)
                            from public.consignment_events e
                           where e.consignment_id = c.id
                             and e.kind in ('status_change', 'milestone'))
  )
  from public.consignments c
  left join public.vehicles v on v.id = c.vehicle_id
  left join public.drivers  d on d.id = c.driver_id
  where c.tracking_token = p_token
    and c.status <> 'draft'
  limit 1
$$;

comment on function public.track_consignment(text) is
  'Public tracking projection. Ten whitelisted keys. Never exposes money, GSTINs or phone numbers.';

revoke execute on function public.track_consignment(text) from public;
grant  execute on function public.track_consignment(text) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- DRIVER PORTAL
--
-- The driver needs addresses and cargo to do the job, and nothing about money.
-- Freight, the customer's advance and both GSTINs are deliberately absent.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.driver_trip(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cid uuid; v_org uuid; c public.consignments; v_exp timestamptz;
begin
  select consignment_id, org_id into v_cid, v_org
    from public.resolve_trip_token(p_token);
  if v_cid is null then
    raise exception 'this link has expired or been withdrawn' using errcode = '42501';
  end if;

  select * into c from public.consignments where id = v_cid;
  select max(expires_at) into v_exp
    from public.access_tokens where token = p_token;

  return jsonb_build_object(
    'lr_no',        c.lr_no,
    'status',       c.status,
    'from_city',    c.origin_city,
    'to_city',      c.destination_city,
    'from_address', c.consignor_snapshot->>'address',
    'to_address',   c.consignee_snapshot->>'address',
    'consignor',    c.consignor_snapshot->>'name',
    'consignee',    c.consignee_snapshot->>'name',
    'cargo',        c.cargo_description,
    'packages',     c.packages_count,
    'packages_unit', c.packages_unit,
    'weight_kg',    c.charged_weight_kg,
    'instructions', c.delivery_instructions,
    'vehicle_no',   (select reg_number from public.vehicles where id = c.vehicle_id),
    'language',     (select language   from public.drivers  where id = c.driver_id),
    'expires_at',   v_exp,
    'milestones_done', (select coalesce(jsonb_agg(distinct e.milestone), '[]'::jsonb)
                          from public.consignment_events e
                         where e.consignment_id = c.id and e.milestone is not null),
    'pod_count',    (select count(*) from public.consignment_pods p where p.consignment_id = c.id),
    'expenses',     (select coalesce(jsonb_agg(jsonb_build_object(
                              'kind', x.kind, 'amount', x.amount,
                              'litres', x.litres, 'spent_at', x.spent_at
                            ) order by x.spent_at desc), '[]'::jsonb)
                       from public.trip_expenses x
                      where x.consignment_id = c.id and x.entered_by_type = 'driver')
  );
end;
$$;

revoke execute on function public.driver_trip(text) from public;
grant  execute on function public.driver_trip(text) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- driver_milestone: the one big button.
--
-- 'departed'  auto-advances dispatched → in_transit
-- 'unloaded'  auto-advances in_transit → delivered
-- Both delegate to _apply_transition so preconditions and event-writing are
-- never duplicated. Milestones themselves are always recorded, even when they
-- imply no status change.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.driver_milestone(
  p_token text,
  p_kind  text,
  p_at    timestamptz default now(),
  p_note  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cid uuid; v_org uuid; v_status text; v_target text; v_at timestamptz;
begin
  if p_kind not in ('loaded', 'departed', 'reached', 'unloaded') then
    raise exception 'unknown milestone %', p_kind using errcode = '22023';
  end if;

  select consignment_id, org_id into v_cid, v_org
    from public.resolve_trip_token(p_token);
  if v_cid is null then
    raise exception 'this link has expired or been withdrawn' using errcode = '42501';
  end if;

  -- A phone with a wrong clock must not be able to future-date the record.
  v_at := least(coalesce(p_at, now()), now());

  select status into v_status from public.consignments where id = v_cid;

  if v_status in ('cancelled', 'settled') then
    raise exception 'this trip is closed' using errcode = '23514';
  end if;

  insert into public.consignment_events (
    org_id, consignment_id, kind, milestone, event_time, remarks, actor_type
  ) values (
    v_org, v_cid, 'milestone', p_kind, v_at, p_note, 'driver'
  );

  v_target := case
    when p_kind = 'departed' and v_status = 'dispatched' then 'in_transit'
    when p_kind = 'unloaded' and v_status = 'in_transit' then 'delivered'
    else null
  end;

  if v_target is not null then
    return public._apply_transition(v_cid, v_target, '{}'::jsonb, v_at, 'driver', null);
  end if;

  return jsonb_build_object('status', v_status, 'milestone', p_kind, 'recorded', true);
end;
$$;

revoke execute on function public.driver_milestone(text, text, timestamptz, text) from public;
grant  execute on function public.driver_milestone(text, text, timestamptz, text) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- driver_add_expense. ON CONFLICT DO NOTHING on (consignment_id, client_id)
-- makes a retried offline submission idempotent.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.driver_add_expense(
  p_token        text,
  p_kind         text,
  p_amount       numeric,
  p_litres       numeric default null,
  p_receipt_path text default null,
  p_client_id    uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_cid uuid; v_org uuid; v_id uuid; v_deduped boolean := false;
begin
  if p_kind not in ('diesel', 'toll', 'loading', 'unloading', 'halting', 'other') then
    raise exception 'a driver cannot record an expense of kind %', p_kind using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'amount must be zero or more' using errcode = '23514';
  end if;

  select consignment_id, org_id into v_cid, v_org
    from public.resolve_trip_token(p_token);
  if v_cid is null then
    raise exception 'this link has expired or been withdrawn' using errcode = '42501';
  end if;

  insert into public.trip_expenses (
    org_id, consignment_id, kind, amount, litres, paid_by,
    receipt_path, entered_by_type, client_id
  ) values (
    v_org, v_cid, p_kind, p_amount,
    case when p_kind = 'diesel' then p_litres else null end,
    'driver', p_receipt_path, 'driver', p_client_id
  )
  on conflict (consignment_id, client_id) do nothing
  returning id into v_id;

  if v_id is null then
    v_deduped := true;
    select id into v_id from public.trip_expenses
     where consignment_id = v_cid and client_id = p_client_id;
  else
    insert into public.consignment_events (
      org_id, consignment_id, kind, event_time, remarks, payload, actor_type
    ) values (
      v_org, v_cid, 'expense_added', now(), p_kind,
      jsonb_build_object('amount', p_amount, 'kind', p_kind), 'driver'
    );
  end if;

  return jsonb_build_object('id', v_id, 'deduped', v_deduped);
end;
$$;

revoke execute on function public.driver_add_expense(text, text, numeric, numeric, text, uuid) from public;
grant  execute on function public.driver_add_expense(text, text, numeric, numeric, text, uuid) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- driver_register_pod: called by the POD route handler AFTER the storage
-- upload succeeds. NOT granted to anon — the route holds the service role, so
-- a browser cannot claim a POD exists without having uploaded one.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.driver_register_pod(
  p_token     text,
  p_path      text,
  p_client_id uuid,
  p_page_no   integer default 1
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_cid uuid; v_org uuid; v_id uuid; v_deduped boolean := false;
begin
  select consignment_id, org_id into v_cid, v_org
    from public.resolve_trip_token(p_token);
  if v_cid is null then
    raise exception 'this link has expired or been withdrawn' using errcode = '42501';
  end if;

  insert into public.consignment_pods (
    org_id, consignment_id, page_no, storage_path, client_id, uploaded_by_type
  ) values (
    v_org, v_cid, p_page_no, p_path, p_client_id, 'driver'
  )
  on conflict (consignment_id, client_id) do nothing
  returning id into v_id;

  if v_id is null then
    v_deduped := true;
    select id into v_id from public.consignment_pods
     where consignment_id = v_cid and client_id = p_client_id;
  else
    insert into public.consignment_events (
      org_id, consignment_id, kind, event_time, remarks, actor_type
    ) values (v_org, v_cid, 'pod_uploaded', now(), 'Page ' || p_page_no, 'driver');
  end if;

  return jsonb_build_object('id', v_id, 'deduped', v_deduped);
end;
$$;

revoke execute on function public.driver_register_pod(text, text, uuid, integer) from public;
-- Intentionally granted to NOBODY: service role only.

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop function if exists public.driver_register_pod(text, text, uuid, integer);
-- drop function if exists public.driver_add_expense(text, text, numeric, numeric, text, uuid);
-- drop function if exists public.driver_milestone(text, text, timestamptz, text);
-- drop function if exists public.driver_trip(text);
-- drop function if exists public.track_consignment(text);
-- drop function if exists public.resolve_trip_token(text);
