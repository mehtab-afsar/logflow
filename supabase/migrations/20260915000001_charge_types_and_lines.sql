-- ═══════════════════════════════════════════════════════════════════════════
-- 15 · Flexible additional charges
--
-- WHY: freight/loading/unloading/detention/other_charges were 4 fixed columns
-- on consignments, summed into taxable_value via a GENERATED ALWAYS AS (...)
-- STORED column. A transporter's real charge sheet is not 4 fixed lines — it
-- is "whatever this LR actually needed", org-configurable, and sometimes
-- payable onward to a vendor rather than billable to the consignor. A
-- GENERATED column cannot sum a child table (it may not reference another
-- table at all), so this migration:
--
--   1. adds charge_types (an org-configurable master, seeded with 5 system
--      rows so old data has a like-for-like home) and consignment_charge_lines
--      (the real line items, each independently flagged billable to the
--      consignor and/or attributable to a vendor's payable);
--
--   2. converts taxable_value from a generated column to a plain numeric(12,2)
--      kept in sync by a trigger on consignment_charge_lines — ALTER COLUMN
--      ... DROP EXPRESSION preserves every already-computed value, so this is
--      a type change, not a data migration;
--
--   3. backfills one charge_lines row per non-zero old column per EXISTING
--      consignment against the org's seeded system charge_types, so nothing
--      that already printed a freight figure loses it.
--
-- consignments_tax_total_chk (invoice_total = taxable_value + taxes) is left
-- exactly as it was: it is agnostic to how taxable_value is derived.
--
-- The 4 old columns (freight, loading, unloading, detention, other_charges)
-- are NOT dropped this release — an LR is a statutory document and old rows
-- must keep reprinting identically. They are marked deprecated below and the
-- application stops writing them going forward; consignment_charge_lines is
-- now the single source of truth for taxable_value.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- charge_types: org-configurable master. Same soft-delete/case-insensitive-
-- unique shape as parties/vehicles/drivers (migration 03).
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.charge_types (
  id                             uuid primary key default gen_random_uuid(),
  org_id                         uuid not null references public.organisations(id) on delete cascade,
  code                           text not null,
  label                          text not null,
  default_billable_to_consignor boolean not null default true,
  default_billable_to_vendor    boolean not null default false,
  -- The 5 rows seeded per org at org-creation time (and backfilled below for
  -- orgs that already existed). Not user-deletable — see the update/delete
  -- policy note below — so old LRs always have a charge type to point at.
  is_system                     boolean not null default false,
  deleted_at                    timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint charge_types_code_chk  check (btrim(code)  <> ''),
  constraint charge_types_label_chk check (btrim(label) <> '')
);

create unique index if not exists charge_types_org_code_uniq
  on public.charge_types (org_id, upper(btrim(code)))
  where deleted_at is null;

create index if not exists charge_types_org_idx
  on public.charge_types (org_id) where deleted_at is null;

comment on table public.charge_types is
  'Org-configurable additional-charge master. 5 system rows (FREIGHT/LOADING/UNLOADING/DETENTION/OTHER) are seeded per org so pre-existing consignments have a home for their old fixed-column figures.';
comment on column public.charge_types.is_system is
  'Seeded at org creation, never user-created. Not a write restriction by itself — routes decide what a caller may edit.';

drop trigger if exists charge_types_updated_at on public.charge_types;
create trigger charge_types_updated_at before update on public.charge_types
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- consignment_charge_lines: the real line items behind one LR's charges.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.consignment_charge_lines (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organisations(id) on delete cascade,
  consignment_id         uuid not null references public.consignments(id) on delete cascade,
  charge_type_id         uuid not null references public.charge_types(id) on delete restrict,
  description            text,
  amount                 numeric(12,2) not null default 0 constraint consignment_charge_lines_amount_chk check (amount >= 0),
  billable_to_consignor  boolean not null default true,
  billable_to_vendor     boolean not null default false,
  created_by             uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now()
);

create index if not exists consignment_charge_lines_consignment_idx
  on public.consignment_charge_lines (consignment_id);
create index if not exists consignment_charge_lines_org_idx
  on public.consignment_charge_lines (org_id);
create index if not exists consignment_charge_lines_charge_type_idx
  on public.consignment_charge_lines (charge_type_id);

comment on table public.consignment_charge_lines is
  'Line items behind one LR''s taxable_value. billable_to_consignor drives taxable_value (migration trigger below); billable_to_vendor is read by the future payment ledger (plan step 3) and has no schema effect here yet. Frozen once the parent consignment is billed — see the trigger below.';

-- ───────────────────────────────────────────────────────────────────────────
-- taxable_value: GENERATED → plain column.
--
-- DROP EXPRESSION preserves every already-computed value — this changes the
-- column's kind, not its data. It must happen before the backfill below,
-- because the recompute trigger UPDATEs this column, and Postgres refuses a
-- direct UPDATE of a still-GENERATED column.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.consignments alter column taxable_value drop expression if exists;
alter table public.consignments alter column taxable_value set default 0;
alter table public.consignments alter column taxable_value set not null;

comment on column public.consignments.taxable_value is
  'Sum of consignment_charge_lines.amount where billable_to_consignor, kept in sync by recompute_consignment_taxable_value() below. Was GENERATED ALWAYS AS (freight+loading+unloading+detention+other_charges) STORED before migration 15 — a generated column cannot sum a child table.';

comment on column public.consignments.freight        is 'Deprecated by migration 15 — superseded by consignment_charge_lines. Kept for statutory reprint of pre-existing LRs; the application stops writing it.';
comment on column public.consignments.loading        is 'Deprecated by migration 15 — superseded by consignment_charge_lines. Kept for statutory reprint of pre-existing LRs; the application stops writing it.';
comment on column public.consignments.unloading       is 'Deprecated by migration 15 — superseded by consignment_charge_lines. Kept for statutory reprint of pre-existing LRs; the application stops writing it.';
comment on column public.consignments.detention       is 'Deprecated by migration 15 — superseded by consignment_charge_lines. Kept for statutory reprint of pre-existing LRs; the application stops writing it.';
comment on column public.consignments.other_charges    is 'Deprecated by migration 15 — superseded by consignment_charge_lines. Kept for statutory reprint of pre-existing LRs; the application stops writing it.';

-- ───────────────────────────────────────────────────────────────────────────
-- Freeze once billed: same "credit note, not edit" philosophy as everywhere
-- else in this schema. A billed line cannot be inserted, changed or removed.
-- BEFORE, so a rejected write never reaches the recompute trigger below.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.block_charge_line_edit_if_billed()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_consignment_id uuid := coalesce(new.consignment_id, old.consignment_id);
  v_bill_id        uuid;
begin
  select bill_id into v_bill_id from public.consignments where id = v_consignment_id;
  if v_bill_id is not null then
    raise exception 'consignment_charge_lines: this consignment is already billed — charge lines are frozen'
      using errcode = '55000';
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.block_charge_line_edit_if_billed() is
  'BEFORE trigger on consignment_charge_lines: refuses insert/update/delete once the parent consignment has bill_id set.';

drop trigger if exists consignment_charge_lines_block_billed on public.consignment_charge_lines;
create trigger consignment_charge_lines_block_billed
  before insert or update or delete on public.consignment_charge_lines
  for each row execute function public.block_charge_line_edit_if_billed();

-- ───────────────────────────────────────────────────────────────────────────
-- Keep taxable_value in sync. Runs as the invoking user (not SECURITY
-- DEFINER): the roles allowed to write consignment_charge_lines (owner,
-- dispatcher, accounts — see the INSERT/UPDATE/DELETE policies below) are the
-- same roles the existing consignments_update policy already allows to write
-- taxable_value, so no privilege escalation is needed here.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.recompute_consignment_taxable_value()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_consignment_id uuid := coalesce(new.consignment_id, old.consignment_id);
begin
  update public.consignments
     set taxable_value = (
           select coalesce(sum(amount) filter (where billable_to_consignor), 0)
             from public.consignment_charge_lines
            where consignment_id = v_consignment_id
         )
   where id = v_consignment_id;
  return coalesce(new, old);
end;
$$;

comment on function public.recompute_consignment_taxable_value() is
  'AFTER trigger on consignment_charge_lines: recomputes consignments.taxable_value as sum(amount) where billable_to_consignor. consignments_tax_total_chk is unchanged and agnostic to this.';

drop trigger if exists consignment_charge_lines_recompute on public.consignment_charge_lines;
create trigger consignment_charge_lines_recompute
  after insert or update or delete on public.consignment_charge_lines
  for each row execute function public.recompute_consignment_taxable_value();

-- ───────────────────────────────────────────────────────────────────────────
-- RLS — same masters pattern as migration 03: org-scoped select, write gated
-- by has_role(). consignment_charge_lines write roles include 'accounts'
-- because charges are routinely adjusted while reconciling a bill, unlike the
-- other masters (owner/dispatcher only).
-- ───────────────────────────────────────────────────────────────────────────
alter table public.charge_types              enable row level security;
alter table public.consignment_charge_lines  enable row level security;

drop policy if exists "charge_types_select" on public.charge_types;
create policy "charge_types_select" on public.charge_types
  for select to authenticated using (org_id = (select public.current_org_id()));

drop policy if exists "charge_types_insert" on public.charge_types;
create policy "charge_types_insert" on public.charge_types
  for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role('owner', 'dispatcher')));

drop policy if exists "charge_types_update" on public.charge_types;
create policy "charge_types_update" on public.charge_types
  for update to authenticated
  using      (org_id = (select public.current_org_id()) and (select public.has_role('owner', 'dispatcher')))
  with check (org_id = (select public.current_org_id()));

-- No DELETE policy: charge types are soft-deleted so charge lines keep their
-- reference, same as every other master.

drop policy if exists "consignment_charge_lines_select" on public.consignment_charge_lines;
create policy "consignment_charge_lines_select" on public.consignment_charge_lines
  for select to authenticated using (org_id = (select public.current_org_id()));

drop policy if exists "consignment_charge_lines_insert" on public.consignment_charge_lines;
create policy "consignment_charge_lines_insert" on public.consignment_charge_lines
  for insert to authenticated
  with check (org_id = (select public.current_org_id())
              and (select public.has_role('owner', 'dispatcher', 'accounts')));

drop policy if exists "consignment_charge_lines_update" on public.consignment_charge_lines;
create policy "consignment_charge_lines_update" on public.consignment_charge_lines
  for update to authenticated
  using      (org_id = (select public.current_org_id())
              and (select public.has_role('owner', 'dispatcher', 'accounts')))
  with check (org_id = (select public.current_org_id()));

drop policy if exists "consignment_charge_lines_delete" on public.consignment_charge_lines;
create policy "consignment_charge_lines_delete" on public.consignment_charge_lines
  for delete to authenticated
  using (org_id = (select public.current_org_id())
         and (select public.has_role('owner', 'dispatcher', 'accounts')));

revoke all on public.charge_types             from anon;
revoke all on public.consignment_charge_lines from anon;

grant select, insert, update         on public.charge_types             to authenticated;
grant select, insert, update, delete on public.consignment_charge_lines to authenticated;

-- Migration 12's blanket `grant ... to service_role` is a one-time snapshot
-- over the tables that existed then — it does not retroactively cover tables
-- created in later migrations. Same fix as org_invites and
-- lr_blank_reservations before it: the seed script (and any other
-- service-role writer) needs this explicitly, or seed_system_charge_types()
-- fails with "permission denied for table charge_types" the moment an org is
-- inserted via the service role.
grant all privileges on public.charge_types             to service_role;
grant all privileges on public.consignment_charge_lines to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Seed the 5 system charge types for every NEW organisation, from here on.
-- Plain trigger (not SECURITY DEFINER): create_organisation() runs as the
-- function owner, which bypasses RLS as it always has; a direct service-role
-- insert (seed scripts) bypasses RLS by role. Either way this INSERT succeeds
-- without needing definer privileges of its own.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.seed_system_charge_types()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.charge_types
    (org_id, code, label, default_billable_to_consignor, default_billable_to_vendor, is_system)
  values
    (new.id, 'FREIGHT',   'Freight',   true, false, true),
    (new.id, 'LOADING',   'Loading',   true, false, true),
    (new.id, 'UNLOADING', 'Unloading', true, false, true),
    (new.id, 'DETENTION', 'Detention', true, false, true),
    (new.id, 'OTHER',     'Other',     true, false, true);
  return new;
end;
$$;

comment on function public.seed_system_charge_types() is
  'AFTER INSERT trigger on organisations: seeds the 5 system charge types every org needs so pre-existing 4-field consignments (and old-shape UIs) always have somewhere to point.';

drop trigger if exists organisations_seed_charge_types on public.organisations;
create trigger organisations_seed_charge_types
  after insert on public.organisations
  for each row execute function public.seed_system_charge_types();

-- ───────────────────────────────────────────────────────────────────────────
-- Backfill for organisations that already existed before this migration: the
-- trigger above only fires for orgs created from now on.
-- ───────────────────────────────────────────────────────────────────────────
insert into public.charge_types (org_id, code, label, default_billable_to_consignor, default_billable_to_vendor, is_system)
select o.id, ct.code, ct.label, true, false, true
  from public.organisations o
  cross join (values
    ('FREIGHT',   'Freight'),
    ('LOADING',   'Loading'),
    ('UNLOADING', 'Unloading'),
    ('DETENTION', 'Detention'),
    ('OTHER',     'Other')
  ) as ct(code, label)
 where not exists (
   select 1 from public.charge_types c
    where c.org_id = o.id and upper(c.code) = ct.code and c.deleted_at is null
 );

-- ───────────────────────────────────────────────────────────────────────────
-- Backfill: one consignment_charge_lines row per non-zero old column per
-- EXISTING consignment, against the org's system charge_types. Guarded on
-- "this consignment has no charge lines yet at all" so a re-run of this
-- migration (or a re-run of a failed batch) never double-inserts.
--
-- Each insert fires the recompute trigger above, which sets taxable_value —
-- to the same figure the old GENERATED column already held, since it is the
-- same sum.
-- ───────────────────────────────────────────────────────────────────────────
insert into public.consignment_charge_lines
  (org_id, consignment_id, charge_type_id, description, amount, billable_to_consignor, billable_to_vendor, created_at)
select c.org_id, c.id, ct.id, ct.label, v.amt, true, false, c.created_at
  from public.consignments c
  join lateral (
    select 'FREIGHT'   as code, c.freight       as amt
    union all select 'LOADING',   c.loading
    union all select 'UNLOADING', c.unloading
    union all select 'DETENTION', c.detention
    union all select 'OTHER',     c.other_charges
  ) as v on v.amt is not null and v.amt > 0
  join public.charge_types ct
    on ct.org_id = c.org_id and upper(ct.code) = v.code and ct.is_system and ct.deleted_at is null
 where not exists (
   select 1 from public.consignment_charge_lines existing
    where existing.consignment_id = c.id
 );

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop trigger if exists organisations_seed_charge_types on public.organisations;
-- drop function if exists public.seed_system_charge_types();
-- drop trigger if exists consignment_charge_lines_recompute on public.consignment_charge_lines;
-- drop function if exists public.recompute_consignment_taxable_value();
-- drop trigger if exists consignment_charge_lines_block_billed on public.consignment_charge_lines;
-- drop function if exists public.block_charge_line_edit_if_billed();
-- drop table if exists public.consignment_charge_lines;
-- drop table if exists public.charge_types;
-- alter table public.consignments alter column taxable_value drop default;
-- alter table public.consignments alter column taxable_value
--   add generated always as (freight + loading + unloading + detention + other_charges) stored;
