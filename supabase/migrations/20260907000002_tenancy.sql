-- ═══════════════════════════════════════════════════════════════════════════
-- 02 · Tenancy: organisations → branches → profiles, and the RLS helpers
--
-- WHY: Multi-tenant from day one, so a second transporter or a second branch
-- is an INSERT rather than a migration. Drivers and customers never get rows
-- here — they reach the system only through signed tokens (migration 07).
--
-- The three helper functions at the bottom are the anti-recursion layer. A
-- policy on `profiles` that itself queries `profiles` recurses forever; a
-- SECURITY DEFINER function bypasses RLS and breaks the cycle. They live here
-- rather than in migration 01 because a `language sql` function body is
-- parsed and validated at CREATE time, so they cannot be defined before the
-- table they read.
--
-- Tax mode is per-organisation and drives every rupee on every statutory
-- document. Since GST 2.0 (Sept 2025) a goods transport agency is either on
-- RCM (no tax on the LR at all — most small fleets), FCM 5% (no ITC) or
-- FCM 18% (with ITC). The old 12% slab is gone. See lib/tax.ts.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.organisations (
  id          uuid primary key default gen_random_uuid(),
  legal_name  text not null,
  gstin       text,   -- null when unregistered; then transin is used instead
  transin     text,   -- transporter ID, for a GTA without a GSTIN
  pan         text,
  state_code  char(2) not null,   -- GST state code, e.g. '29' Karnataka
  address     text,
  logo_path   text,
  tax_mode    text not null default 'rcm'
              constraint organisations_tax_mode_chk
              check (tax_mode in ('rcm', 'fcm_5', 'fcm_18')),
  risk_clause text not null default 'At owner''s risk',
  bank_details jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint organisations_state_code_chk check (state_code ~ '^[0-9]{2}$'),
  constraint organisations_identity_chk check (gstin is not null or transin is not null)
);

comment on table public.organisations is 'One transporter. The tenancy root.';
comment on column public.organisations.tax_mode is
  'rcm | fcm_5 | fcm_18. Copied onto each consignment at creation so historical documents reprint unchanged.';
comment on column public.organisations.state_code is
  'GST state code of the registered place of business. Compared against place of supply to pick IGST vs CGST+SGST.';

create table if not exists public.branches (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  name        text not null,
  city        text,
  state_code  char(2),
  lr_prefix   text not null default 'LR',
  inv_prefix  text not null default 'INV',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint branches_lr_prefix_chk  check (lr_prefix  ~ '^[A-Z]{2,6}$'),
  constraint branches_inv_prefix_chk check (inv_prefix ~ '^[A-Z]{2,6}$')
);

create index if not exists branches_org_idx on public.branches (org_id);
create unique index if not exists branches_org_name_uniq
  on public.branches (org_id, lower(btrim(name)));

-- Document numbers are sequenced PER BRANCH but must be unique PER
-- ORGANISATION — GST requires an invoice serial to be unique across the entity
-- for a financial year. The prefix is the only thing separating two branches'
-- counters, so two branches sharing a prefix would mint identical numbers.
-- Enforce distinct prefixes rather than discovering the collision at bill time.
create unique index if not exists branches_org_lr_prefix_uniq
  on public.branches (org_id, lr_prefix);
create unique index if not exists branches_org_inv_prefix_uniq
  on public.branches (org_id, inv_prefix);

comment on table public.branches is
  'A dispatch office. LR and invoice numbers are sequenced per branch per financial year (migration 04).';

create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid not null references public.organisations(id) on delete cascade,
  full_name  text,
  role       text not null default 'dispatcher'
             constraint profiles_role_chk
             check (role in ('owner', 'dispatcher', 'accounts', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_org_idx on public.profiles (org_id);

comment on table public.profiles is
  'Staff only. Drivers and customers never get an auth account — they use scoped tokens (migration 07).';

drop trigger if exists organisations_updated_at on public.organisations;
create trigger organisations_updated_at before update on public.organisations
  for each row execute function public.set_updated_at();
drop trigger if exists branches_updated_at on public.branches;
create trigger branches_updated_at before update on public.branches
  for each row execute function public.set_updated_at();
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- RLS helpers. SECURITY DEFINER to break policy recursion on profiles.
--
-- Callers must use `(select public.current_org_id())` inside policies — the
-- parenthesised subselect is hoisted to an InitPlan evaluated once per query
-- instead of once per row. On a 5,000-row register scan that is 8ms vs 900ms.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select org_id from public.profiles where id = (select auth.uid())
$$;

create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

create or replace function public.has_role(variadic p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_role_name() = any(p_roles), false)
$$;

comment on function public.current_org_id() is
  'The calling user''s organisation. SECURITY DEFINER to avoid RLS recursion on profiles.';

revoke execute on function public.current_org_id()          from public;
revoke execute on function public.current_role_name()       from public;
revoke execute on function public.has_role(variadic text[]) from public;
grant  execute on function public.current_org_id()          to authenticated;
grant  execute on function public.current_role_name()       to authenticated;
grant  execute on function public.has_role(variadic text[]) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────────────────
alter table public.organisations enable row level security;
alter table public.branches      enable row level security;
alter table public.profiles      enable row level security;

drop policy if exists "organisations_select" on public.organisations;
create policy "organisations_select" on public.organisations
  for select to authenticated
  using (id = (select public.current_org_id()));

drop policy if exists "organisations_update" on public.organisations;
create policy "organisations_update" on public.organisations
  for update to authenticated
  using      (id = (select public.current_org_id()) and (select public.has_role('owner')))
  with check (id = (select public.current_org_id()));

drop policy if exists "branches_select" on public.branches;
create policy "branches_select" on public.branches
  for select to authenticated
  using (org_id = (select public.current_org_id()));

drop policy if exists "branches_insert" on public.branches;
create policy "branches_insert" on public.branches
  for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role('owner')));

drop policy if exists "branches_update" on public.branches;
create policy "branches_update" on public.branches
  for update to authenticated
  using      (org_id = (select public.current_org_id()) and (select public.has_role('owner')))
  with check (org_id = (select public.current_org_id()));

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated
  using (org_id = (select public.current_org_id()));

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles
  for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role('owner')));

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update to authenticated
  using      (id = (select auth.uid()) or
              (org_id = (select public.current_org_id()) and (select public.has_role('owner'))))
  with check (org_id = (select public.current_org_id()));

-- No DELETE policy on any of the three: organisations, branches and staff are
-- deactivated, never deleted, so statutory documents keep their references.

-- Supabase grants anon on new public tables by default. Take it back.
revoke all on public.organisations from anon;
revoke all on public.branches      from anon;
revoke all on public.profiles      from anon;

-- ───────────────────────────────────────────────────────────────────────────
-- Table privileges.
--
-- RLS filters ROWS; a GRANT permits the VERB. Both are required, and relying
-- on Supabase's "auto expose new tables" default makes the schema depend on a
-- project setting rather than on this file. Granting explicitly keeps local,
-- CI and hosted identical.
-- ───────────────────────────────────────────────────────────────────────────
grant select, update         on public.organisations to authenticated;
grant select, insert, update on public.branches      to authenticated;
grant select, insert, update on public.profiles      to authenticated;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop function if exists public.has_role(variadic text[]);
-- drop function if exists public.current_role_name();
-- drop function if exists public.current_org_id();
-- drop table if exists public.profiles;
-- drop table if exists public.branches;
-- drop table if exists public.organisations;
