-- ═══════════════════════════════════════════════════════════════════════════
-- 13 · Realtime for the Today board
--
-- WHY: when the driver taps "Unloaded" on his phone at the loading dock, the
-- card should move from In transit to Delivered on the dispatcher's screen
-- without anyone refreshing. That is the moment the product explains itself.
--
-- Only consignment_events is published, not consignments. The event row
-- carries nothing commercially sensitive — a status, a timestamp, an id — so
-- a leaked payload discloses far less than a consignments row would, which
-- carries freight, advances and both parties' snapshots.
--
-- REPLICA IDENTITY stays DEFAULT (primary key only): the client is told which
-- consignment changed and re-fetches through RLS, rather than being handed
-- column values over the socket.
--
-- Realtime respects RLS on the publishing table, and consignment_events
-- already has a select policy scoped to the caller's organisation, so a
-- subscriber only ever receives its own org's events.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'consignment_events'
  ) then
    alter publication supabase_realtime add table public.consignment_events;
  end if;
end $$;

comment on table public.consignment_events is
  'Append-only audit trail. RLS on with zero write policies: only SECURITY DEFINER functions write here. Published to supabase_realtime so the Today board updates live.';

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- alter publication supabase_realtime drop table public.consignment_events;
