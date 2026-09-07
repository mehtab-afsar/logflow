-- ═══════════════════════════════════════════════════════════════════════════
-- 03 · Masters: parties, vehicles, drivers
--
-- WHY: A dispatcher retypes the same twenty consignors every day. These three
-- tables plus autocomplete are what take LR creation from 5 minutes to under
-- one.
--
-- Two deliberate departures from the naive schema:
--
--  1. Uniqueness is a PARTIAL EXPRESSION INDEX, not a table constraint.
--     `unique (org_id, name)` is case- and whitespace-sensitive, so
--     'ABC Traders' and 'abc traders' both insert; and it permanently blocks
--     re-creating a party that was soft-deleted. Normalising in the index
--     fixes both without storing a second column.
--
--  2. Vehicle registration is stored as typed (KA-01-AB-1234) and normalised
--     only inside the index, so the printed LR shows what the owner expects
--     while 'KA01AB1234' still collides.
--
-- Nothing here is ever hard-deleted: an LR references its vehicle and driver
-- for years, so rows are soft-deleted via deleted_at and the FKs downstream
-- are ON DELETE RESTRICT.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.parties (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations(id) on delete cascade,
  name       text not null,
  gstin      text,
  state_code char(2),
  phone      text,
  email      text,
  -- [{label, line1, line2, city, state_code, pincode}]
  addresses  jsonb not null default '[]'::jsonb,
  party_role text not null default 'both'
             constraint parties_role_chk check (party_role in ('consignor', 'consignee', 'both')),
  notes      text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parties_gstin_chk
    check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
  constraint parties_state_code_chk check (state_code is null or state_code ~ '^[0-9]{2}$'),
  constraint parties_addresses_is_array check (jsonb_typeof(addresses) = 'array')
);

create unique index if not exists parties_org_name_uniq
  on public.parties (org_id, lower(btrim(name)))
  where deleted_at is null;

create index if not exists parties_org_idx on public.parties (org_id) where deleted_at is null;

-- Autocomplete: the dispatcher types 3 letters and expects a match.
create index if not exists parties_name_trgm_idx
  on public.parties using gin (name extensions.gin_trgm_ops);

comment on table public.parties is
  'Consignors and consignees. GSTIN format is enforced here; the mod-36 checksum is validated in lib/india/validators.ts.';
comment on column public.parties.state_code is
  'Derived from the first two digits of the GSTIN. Drives place-of-supply and therefore IGST vs CGST+SGST.';

create table if not exists public.vehicles (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations(id) on delete cascade,
  reg_number      text not null,
  vehicle_type    text not null,
  capacity_tons   numeric(6,2),
  ownership       text not null default 'own'
                  constraint vehicles_ownership_chk check (ownership in ('own', 'attached')),
  rc_expiry        date,
  fitness_expiry   date,
  insurance_expiry date,
  permit_expiry    date,
  puc_expiry       date,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Normalised in the index so 'KA 01 AB 1234' and 'KA-01-AB-1234' collide,
-- while reg_number keeps the formatting the owner recognises on paper.
create unique index if not exists vehicles_org_reg_uniq
  on public.vehicles (org_id, upper(regexp_replace(reg_number, '[^A-Za-z0-9]', '', 'g')))
  where deleted_at is null;

create index if not exists vehicles_org_idx on public.vehicles (org_id) where deleted_at is null;

-- Powers the "documents expiring in 30 days" KPI and the pre-dispatch warning.
create index if not exists vehicles_expiry_idx
  on public.vehicles (org_id, least(rc_expiry, fitness_expiry, insurance_expiry, permit_expiry, puc_expiry))
  where deleted_at is null;

comment on table public.vehicles is
  'Own and attached trucks. Document expiries drive dashboard badges at 30/15/0 days and a warn-with-override on dispatch.';

create table if not exists public.drivers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organisations(id) on delete cascade,
  full_name  text not null,
  phone      text not null,
  dl_number  text,
  dl_expiry  date,
  language   text not null default 'hi'
             constraint drivers_language_chk check (language in ('en', 'hi', 'kn')),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint drivers_phone_chk check (phone ~ '^[6-9][0-9]{9}$')
);

create unique index if not exists drivers_org_phone_uniq
  on public.drivers (org_id, phone) where deleted_at is null;

create index if not exists drivers_org_idx on public.drivers (org_id) where deleted_at is null;

comment on table public.drivers is
  'Drivers never authenticate. The phone number is for the WhatsApp deep link; `language` picks the driver-portal dictionary.';
comment on column public.drivers.phone is
  '10-digit Indian mobile, no country code. wa.me links prepend 91.';

drop trigger if exists parties_updated_at on public.parties;
create trigger parties_updated_at before update on public.parties
  for each row execute function public.set_updated_at();
drop trigger if exists vehicles_updated_at on public.vehicles;
create trigger vehicles_updated_at before update on public.vehicles
  for each row execute function public.set_updated_at();
drop trigger if exists drivers_updated_at on public.drivers;
create trigger drivers_updated_at before update on public.drivers
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- RLS: read for everyone in the org, write for owner + dispatcher.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.parties  enable row level security;
alter table public.vehicles enable row level security;
alter table public.drivers  enable row level security;

drop policy if exists "parties_select" on public.parties;
create policy "parties_select" on public.parties
  for select to authenticated using (org_id = (select public.current_org_id()));
drop policy if exists "parties_insert" on public.parties;
create policy "parties_insert" on public.parties
  for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role('owner','dispatcher')));
drop policy if exists "parties_update" on public.parties;
create policy "parties_update" on public.parties
  for update to authenticated
  using      (org_id = (select public.current_org_id()) and (select public.has_role('owner','dispatcher')))
  with check (org_id = (select public.current_org_id()));

drop policy if exists "vehicles_select" on public.vehicles;
create policy "vehicles_select" on public.vehicles
  for select to authenticated using (org_id = (select public.current_org_id()));
drop policy if exists "vehicles_insert" on public.vehicles;
create policy "vehicles_insert" on public.vehicles
  for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role('owner','dispatcher')));
drop policy if exists "vehicles_update" on public.vehicles;
create policy "vehicles_update" on public.vehicles
  for update to authenticated
  using      (org_id = (select public.current_org_id()) and (select public.has_role('owner','dispatcher')))
  with check (org_id = (select public.current_org_id()));

drop policy if exists "drivers_select" on public.drivers;
create policy "drivers_select" on public.drivers
  for select to authenticated using (org_id = (select public.current_org_id()));
drop policy if exists "drivers_insert" on public.drivers;
create policy "drivers_insert" on public.drivers
  for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role('owner','dispatcher')));
drop policy if exists "drivers_update" on public.drivers;
create policy "drivers_update" on public.drivers
  for update to authenticated
  using      (org_id = (select public.current_org_id()) and (select public.has_role('owner','dispatcher')))
  with check (org_id = (select public.current_org_id()));

-- No DELETE policies: masters are soft-deleted so consignments keep their refs.

revoke all on public.parties  from anon;
revoke all on public.vehicles from anon;
revoke all on public.drivers  from anon;

-- Table privileges (see migration 02 for why these are explicit).
grant select, insert, update on public.parties  to authenticated;
grant select, insert, update on public.vehicles to authenticated;
grant select, insert, update on public.drivers  to authenticated;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop table if exists public.drivers;
-- drop table if exists public.vehicles;
-- drop table if exists public.parties;
