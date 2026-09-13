-- ═══════════════════════════════════════════════════════════════════════════
-- Office-recorded milestones and PODs — the other half of the phone-fallback
-- story. A driver with no smartphone can still call the office, and the
-- office needs to record what he said correctly attributed as "staff, from
-- a phone call" rather than either silently doing nothing or misattributing
-- it as if the driver had used the app himself.
--
-- Both driver_milestone() and driver_register_pod() are refactored to
-- delegate to a shared internal helper, which is now called from a second,
-- staff-authenticated wrapper — so the auto-advance mapping
-- (departed→in_transit, unloaded→delivered) and the POD-dedup logic each
-- have exactly one implementation, not two that could quietly drift apart.
--
-- The internal helpers are revoked from PUBLIC and never separately granted
-- to authenticated or anon — same pattern _apply_transition already uses.
-- A SECURITY DEFINER function runs as its owner, so one owned-by-the-same-
-- role function calling another needs no grant of its own; only the two
-- outer wrappers below need one, each to exactly the role that should reach
-- it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- _record_milestone: the shared body of driver_milestone(), parameterised by
-- actor instead of hard-coding 'driver'.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._record_milestone(
  p_consignment_id uuid,
  p_org_id         uuid,
  p_kind           text,
  p_at             timestamptz,
  p_note           text,
  p_actor_type     text,
  p_actor_user_id  uuid,
  p_payload        jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_target text;
begin
  if p_kind not in ('loaded', 'departed', 'reached', 'unloaded') then
    raise exception 'unknown milestone %', p_kind using errcode = '22023';
  end if;

  select status into v_status from public.consignments where id = p_consignment_id;
  if v_status is null then
    raise exception 'consignment not found' using errcode = 'P0002';
  end if;
  if v_status in ('cancelled', 'settled') then
    raise exception 'this trip is closed' using errcode = '23514';
  end if;

  insert into public.consignment_events (
    org_id, consignment_id, kind, milestone, event_time, remarks, actor_type, actor_user_id, payload
  ) values (
    p_org_id, p_consignment_id, 'milestone', p_kind, p_at, p_note,
    p_actor_type, p_actor_user_id, coalesce(p_payload, '{}'::jsonb)
  );

  v_target := case
    when p_kind = 'departed' and v_status = 'dispatched' then 'in_transit'
    when p_kind = 'unloaded' and v_status = 'in_transit' then 'delivered'
    else null
  end;

  if v_target is not null then
    return public._apply_transition(p_consignment_id, v_target, coalesce(p_payload, '{}'::jsonb), p_at, p_actor_type, p_actor_user_id);
  end if;

  return jsonb_build_object('status', v_status, 'milestone', p_kind, 'recorded', true);
end;
$$;

revoke execute on function public._record_milestone(uuid, uuid, text, timestamptz, text, text, uuid, jsonb) from public;

-- driver_milestone: unchanged behaviour, now delegating.
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
declare v_cid uuid; v_org uuid;
begin
  select consignment_id, org_id into v_cid, v_org
    from public.resolve_trip_token(p_token);
  if v_cid is null then
    raise exception 'this link has expired or been withdrawn' using errcode = '42501';
  end if;

  -- A phone with a wrong clock must not be able to future-date the record.
  return public._record_milestone(
    v_cid, v_org, p_kind, least(coalesce(p_at, now()), now()), p_note, 'driver', null
  );
end;
$$;

revoke execute on function public.driver_milestone(text, text, timestamptz, text) from public;
grant  execute on function public.driver_milestone(text, text, timestamptz, text) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- record_milestone_for_driver: the office recording a phone call. Same
-- milestone vocabulary, same auto-advance, correctly attributed.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.record_milestone_for_driver(
  p_consignment_id uuid,
  p_kind           text,
  p_at             timestamptz default now(),
  p_note           text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_org uuid := public.current_org_id();
begin
  if v_org is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.has_role('owner', 'dispatcher') then
    raise exception 'this action requires the owner or dispatcher role' using errcode = '42501';
  end if;
  if not exists (select 1 from public.consignments c where c.id = p_consignment_id and c.org_id = v_org) then
    -- "not found", not "forbidden" — same reasoning as transition_consignment.
    raise exception 'consignment not found' using errcode = 'P0002';
  end if;

  return public._record_milestone(
    p_consignment_id, v_org, p_kind, least(coalesce(p_at, now()), now()), p_note,
    'staff', (select auth.uid()), jsonb_build_object('reported_via', 'phone')
  );
end;
$$;

revoke execute on function public.record_milestone_for_driver(uuid, text, timestamptz, text) from public;
grant  execute on function public.record_milestone_for_driver(uuid, text, timestamptz, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- _register_pod: the shared body of driver_register_pod(), parameterised by
-- who uploaded it. consignment_pods.uploaded_by_type already allows 'office'
-- (migration 05) — this is the first code path that ever writes it.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public._register_pod(
  p_consignment_id    uuid,
  p_org_id            uuid,
  p_path              text,
  p_client_id         uuid,
  p_page_no           integer,
  p_uploaded_by_type  text,
  p_actor_type        text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_id uuid; v_deduped boolean := false;
begin
  insert into public.consignment_pods (
    org_id, consignment_id, page_no, storage_path, client_id, uploaded_by_type
  ) values (
    p_org_id, p_consignment_id, p_page_no, p_path, p_client_id, p_uploaded_by_type
  )
  on conflict (consignment_id, client_id) do nothing
  returning id into v_id;

  if v_id is null then
    v_deduped := true;
    select id into v_id from public.consignment_pods
     where consignment_id = p_consignment_id and client_id = p_client_id;
  else
    insert into public.consignment_events (org_id, consignment_id, kind, event_time, remarks, actor_type)
    values (p_org_id, p_consignment_id, 'pod_uploaded', now(), 'Page ' || p_page_no, p_actor_type);
  end if;

  return jsonb_build_object('id', v_id, 'deduped', v_deduped);
end;
$$;

revoke execute on function public._register_pod(uuid, uuid, text, uuid, integer, text, text) from public;

-- driver_register_pod: unchanged behaviour, now delegating. Still granted to
-- NOBODY but the service role — the route holds it, never a browser session.
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
declare v_cid uuid; v_org uuid;
begin
  select consignment_id, org_id into v_cid, v_org
    from public.resolve_trip_token(p_token);
  if v_cid is null then
    raise exception 'this link has expired or been withdrawn' using errcode = '42501';
  end if;

  return public._register_pod(v_cid, v_org, p_path, p_client_id, coalesce(p_page_no, 1), 'driver', 'driver');
end;
$$;

revoke execute on function public.driver_register_pod(text, text, uuid, integer) from public;
-- Intentionally granted to NOBODY: service role only (see migration 12).

-- ───────────────────────────────────────────────────────────────────────────
-- record_pod_for_office: an authenticated office user, not a token — the
-- route calling this uses the service role only for the storage upload
-- itself, then this RPC on the CALLER'S OWN session (current_org_id() and
-- has_role() need the real JWT, which the admin client does not carry).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.record_pod_for_office(
  p_consignment_id uuid,
  p_path           text,
  p_client_id      uuid,
  p_page_no        integer default 1
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare v_org uuid := public.current_org_id();
begin
  if v_org is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- Wider than record_milestone_for_driver's dispatcher-only check: a
  -- late-arriving physical POD directly unblocks billing, so accounts staff
  -- — who already verify PODs and raise bills — can attach one too.
  if not public.has_role('owner', 'dispatcher', 'accounts') then
    raise exception 'this action requires the owner, dispatcher or accounts role' using errcode = '42501';
  end if;
  if not exists (select 1 from public.consignments c where c.id = p_consignment_id and c.org_id = v_org) then
    raise exception 'consignment not found' using errcode = 'P0002';
  end if;

  return public._register_pod(p_consignment_id, v_org, p_path, p_client_id, coalesce(p_page_no, 1), 'office', 'staff');
end;
$$;

revoke execute on function public.record_pod_for_office(uuid, text, uuid, integer) from public;
grant  execute on function public.record_pod_for_office(uuid, text, uuid, integer) to authenticated;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop function if exists public.record_pod_for_office(uuid, text, uuid, integer);
-- drop function if exists public._register_pod(uuid, uuid, text, uuid, integer, text, text);
-- drop function if exists public.record_milestone_for_driver(uuid, text, timestamptz, text);
-- drop function if exists public._record_milestone(uuid, uuid, text, timestamptz, text, text, uuid, jsonb);
-- (driver_milestone and driver_register_pod revert to migration 08's bodies)
