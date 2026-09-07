-- ═══════════════════════════════════════════════════════════════════════════
-- 12 · Service-role access to the lifecycle engine
--
-- WHY: _apply_transition() and next_doc_number() were written to do no
-- authentication of their own, precisely so that trusted callers can drive
-- them — the POD upload route (whose caller is a driver token, not a session)
-- and the seed/import tooling (which has no session at all).
--
-- Migrations 04 and 06 revoke both from PUBLIC, which also removes them from
-- service_role. Granting them back explicitly keeps the intent visible rather
-- than relying on service_role's ambient privileges.
--
-- This does NOT widen the anonymous surface: service_role is never exposed to
-- a browser. __tests__/anon-grants.test.ts still asserts anon reaches exactly
-- four functions and zero tables.
-- ═══════════════════════════════════════════════════════════════════════════

-- Table privileges. service_role is trusted server-side infrastructure: it is
-- never exposed to a browser, it bypasses RLS by design, and it is the only
-- identity that may write consignment_events, access_tokens and
-- document_sequences. This mirrors what Supabase grants by default, stated
-- explicitly so the schema does not depend on a project setting.
grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

grant execute on function public._apply_transition(uuid, text, jsonb, timestamptz, text, uuid)
  to service_role;

grant execute on function public.next_doc_number(uuid, text, date)
  to service_role;

grant execute on function public.resolve_trip_token(text)
  to service_role;

grant execute on function public.driver_register_pod(text, text, uuid, integer)
  to service_role;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- revoke execute on function public.driver_register_pod(text, text, uuid, integer) from service_role;
-- revoke execute on function public.resolve_trip_token(text) from service_role;
-- revoke execute on function public.next_doc_number(uuid, text, date) from service_role;
-- revoke execute on function public._apply_transition(uuid, text, jsonb, timestamptz, text, uuid) from service_role;
