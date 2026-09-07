-- ═══════════════════════════════════════════════════════════════════════════
-- 11 · Dashboard support
--
-- WHY: the exceptions panel asks three questions that are expensive without
-- help — which trips have gone quiet, which PODs are waiting on someone, and
-- which e-way bills are about to lapse under a moving truck. The view below
-- answers them in one round trip, and RLS on the underlying table still
-- applies because the view is not SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════════════════════

-- Last-event lookup, used by both the Kanban card ("3 h since last update")
-- and the stale-trip exception.
create index if not exists consignment_events_latest_idx
  on public.consignment_events (consignment_id, event_time desc, id);

create index if not exists consignment_pods_unverified_idx
  on public.consignment_pods (consignment_id) where verified_at is null;

create index if not exists consignments_active_idx
  on public.consignments (org_id, lr_date desc)
  where status in ('dispatched', 'in_transit', 'delivered', 'pod_verified');

-- ───────────────────────────────────────────────────────────────────────────
-- A plain (not SECURITY DEFINER) view, so the caller's RLS on consignments
-- still filters it. security_invoker is the default in PG15+ for views, but
-- state it explicitly — this is exactly the sort of thing that silently
-- becomes a data leak when someone later adds SECURITY DEFINER.
-- ───────────────────────────────────────────────────────────────────────────
create or replace view public.consignment_exceptions
with (security_invoker = true) as
select
  c.id,
  c.org_id,
  c.lr_no,
  c.status,
  c.origin_city,
  c.destination_city,
  c.ewb_valid_until,
  le.last_event_at,
  case
    when c.status in ('dispatched', 'in_transit')
         and coalesce(le.last_event_at, c.created_at) < now() - interval '24 hours'
      then true else false
  end as is_stale,
  case
    when c.status = 'delivered'
         and exists (select 1 from public.consignment_pods p
                      where p.consignment_id = c.id
                        and p.verified_at is null
                        and p.uploaded_at < now() - interval '24 hours')
      then true else false
  end as pod_unverified_overdue,
  case
    when c.status in ('dispatched', 'in_transit')
         and c.ewb_valid_until is not null
         and c.ewb_valid_until < now() + interval '12 hours'
      then true else false
  end as ewb_expiring
from public.consignments c
left join lateral (
  select max(e.event_time) as last_event_at
    from public.consignment_events e
   where e.consignment_id = c.id
) le on true
where c.status not in ('settled', 'cancelled');

comment on view public.consignment_exceptions is
  'Dashboard exceptions: quiet trips, overdue unverified PODs, e-way bills lapsing within 12h. security_invoker so the caller''s RLS applies.';

revoke all on public.consignment_exceptions from anon;
grant select on public.consignment_exceptions to authenticated;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop view if exists public.consignment_exceptions;
