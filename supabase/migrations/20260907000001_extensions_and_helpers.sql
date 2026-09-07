-- ═══════════════════════════════════════════════════════════════════════════
-- 01 · Extensions and schema-wide helpers
--
-- WHY: Everything downstream depends on three things existing first.
--
--  1. pgcrypto, in the `extensions` schema. Supabase installs extensions there,
--     NOT in public. Every call must be schema-qualified as
--     `extensions.gen_random_bytes(...)`, because our security-definer
--     functions run with `search_path = ''` and would otherwise fail at CALL
--     time (not create time) — i.e. during a demo, not during a migration.
--     Note gen_random_uuid() is the opposite case: it is core (pg_catalog) in
--     PG13+, so it must NOT be qualified.
--
--  2. pg_trgm, for party-name autocomplete. The dispatcher types 3 letters and
--     expects a match; that needs a GIN trigram index, not a LIKE scan.
--
--  3. fy_code(), the Indian financial year (April–March). This is the single
--     definition used by LR numbers, invoice numbers and every report. It is
--     IMMUTABLE — deliberately implemented with extract() arithmetic rather
--     than to_char(), which is only STABLE and therefore cannot be used in an
--     index or a generated column later.
-- ═══════════════════════════════════════════════════════════════════════════

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ───────────────────────────────────────────────────────────────────────────
-- Indian financial year code: 1 April – 31 March, rendered as 4 digits.
--   2026-09-07 → '2627'      (FY 2026-27)
--   2027-02-10 → '2627'      (still FY 2026-27; Feb is before April)
--   2027-04-01 → '2728'      (rolls over on 1 April)
--   1999-12-31 → '9900'      (century wrap is intentional)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.fy_code(p_date date)
returns text
language sql
immutable
parallel safe
as $$
  select lpad(
           (((extract(year from p_date)::int
              - case when extract(month from p_date)::int >= 4 then 0 else 1 end
             ) % 100))::text, 2, '0')
      || lpad(
           (((extract(year from p_date)::int
              - case when extract(month from p_date)::int >= 4 then 0 else 1 end
              + 1) % 100))::text, 2, '0');
$$;

comment on function public.fy_code(date) is
  'Indian financial year code (April-March) as 4 digits, e.g. 2026-09-07 -> 2627. IMMUTABLE so it can be indexed.';

-- ───────────────────────────────────────────────────────────────────────────
-- Generic updated_at trigger.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at. Attach to every mutable table.';

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop function if exists public.set_updated_at();
-- drop function if exists public.fy_code(date);
-- drop extension if exists pg_trgm;
-- drop extension if exists pgcrypto;
