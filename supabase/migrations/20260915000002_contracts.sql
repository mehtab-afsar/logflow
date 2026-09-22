-- ═══════════════════════════════════════════════════════════════════════════
-- 16 · Rate contracts
--
-- WHY: freight is hand-typed on every LR today — no rate card exists at all.
-- A transporter with a standing rate for "this consignor, this lane" (or a
-- standing payable rate for "this vendor's trucks on this lane") wants that
-- rate looked up, not retyped and mis-typed. rate_contracts is that lookup
-- table; it does not write anywhere automatically — a dispatcher accepts the
-- suggested rate into a charge line (migration 15) the same way they type one
-- in by hand today.
--
-- counterparty_type/party_id is NOT cross-validated against parties.party_role
-- by a DB constraint (a CHECK cannot subquery another table) — same as the
-- rest of this schema (vehicles/drivers never cross-validate their FKs
-- either); the route handler and Zod schema enforce it at the boundary.
-- 'vendor' as a counterparty_type does not require parties.party_role to
-- already include 'vendor' (that lands in migration 17) — this table's check
-- constraint is independent of that one.
--
-- No uniqueness constraint on "one active rate per lane": overlapping
-- contracts are a real case (a rate renegotiated mid-quarter, the old one
-- still referenced by historical bookings) — resolution order ("most
-- specific wins") lives in lookup_rate_contract() below, not the schema.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.rate_contracts (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organisations(id) on delete cascade,
  branch_id              uuid references public.branches(id) on delete cascade,
  counterparty_type      text not null
                         constraint rate_contracts_counterparty_type_chk
                         check (counterparty_type in ('consignor', 'vendor')),
  party_id               uuid not null references public.parties(id) on delete restrict,
  -- null = any route / any vehicle type. A contract narrowed on nothing but
  -- party_id is a blanket rate for that counterparty.
  route_origin_city      text,
  route_origin_state     char(2),
  route_destination_city text,
  route_destination_state char(2),
  vehicle_type           text,
  freight_basis          text not null default 'per_trip'
                         constraint rate_contracts_freight_basis_chk
                         check (freight_basis in ('per_trip', 'per_ton')),
  rate                   numeric(12,2) not null check (rate >= 0),
  valid_from             date not null default current_date,
  -- null = open-ended.
  valid_to               date,
  notes                  text,
  deleted_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint rate_contracts_route_state_chk
    check (route_origin_state is null or route_origin_state ~ '^[0-9]{2}$'),
  constraint rate_contracts_dest_state_chk
    check (route_destination_state is null or route_destination_state ~ '^[0-9]{2}$'),
  constraint rate_contracts_validity_chk
    check (valid_to is null or valid_to >= valid_from)
);

create index if not exists rate_contracts_org_idx
  on public.rate_contracts (org_id) where deleted_at is null;

-- The lookup path lookup_rate_contract() actually runs: org + counterparty
-- type + party first, route/vehicle narrowing filtered in the function body
-- (a partial index cannot encode "narrowest match wins" ordering itself, but
-- it does let Postgres avoid a full scan for the common "does this party even
-- have any contract" case).
create index if not exists rate_contracts_lookup_idx
  on public.rate_contracts (org_id, counterparty_type, party_id)
  where deleted_at is null;

comment on table public.rate_contracts is
  'Standing rates a consignor or vendor was agreed with. Looked up (lookup_rate_contract) to suggest a charge-line amount — never applied automatically.';
comment on column public.rate_contracts.counterparty_type is
  'consignor: what we charge them. vendor: what we pay them for an attached/hired truck. Not FK-validated against parties.party_role — see migration comment.';

drop trigger if exists rate_contracts_updated_at on public.rate_contracts;
create trigger rate_contracts_updated_at before update on public.rate_contracts
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- RLS — same masters pattern as migration 03: org-scoped select, write gated
-- by has_role('owner', 'dispatcher'). No delete policy — soft-deleted so a
-- historical booking that resolved against a contract keeps a coherent trail
-- even after the rate is retired.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.rate_contracts enable row level security;

drop policy if exists "rate_contracts_select" on public.rate_contracts;
create policy "rate_contracts_select" on public.rate_contracts
  for select to authenticated using (org_id = (select public.current_org_id()));

drop policy if exists "rate_contracts_insert" on public.rate_contracts;
create policy "rate_contracts_insert" on public.rate_contracts
  for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role('owner', 'dispatcher')));

drop policy if exists "rate_contracts_update" on public.rate_contracts;
create policy "rate_contracts_update" on public.rate_contracts
  for update to authenticated
  using      (org_id = (select public.current_org_id()) and (select public.has_role('owner', 'dispatcher')))
  with check (org_id = (select public.current_org_id()));

revoke all on public.rate_contracts from anon;
grant select, insert, update on public.rate_contracts to authenticated;

-- Migration 12's blanket `grant ... to service_role` is a one-time snapshot —
-- does not retroactively cover a table created here. Same fix as
-- charge_types (migration 15), lr_blank_reservations, and org_invites before
-- it — granted explicitly so no service-role writer 42501s on this table.
grant all privileges on public.rate_contracts to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- lookup_rate_contract: most-specific-match lookup, one tested
-- implementation shared by the LR form (consignor rate) and vendor
-- settlement UI (payable rate) — not a privilege-boundary crossing (RLS
-- already scopes reads to current_org_id()), just the "one tested
-- implementation" reasoning create_bill() already uses for its own logic.
--
-- Specificity, most to least: route + vehicle match > route match only >
-- vehicle match only > party-only (blanket) contract. Within a specificity
-- tier, the most recently started contract wins (valid_from desc) — the
-- latest renegotiated rate for an otherwise-identical match.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.lookup_rate_contract(
  p_counterparty_type text,
  p_party_id          uuid,
  p_origin_city       text default null,
  p_destination_city  text default null,
  p_vehicle_type      text default null,
  p_on_date           date default current_date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'contract_id', rc.id,
    'rate', rc.rate,
    'freight_basis', rc.freight_basis
  )
    from public.rate_contracts rc
   where rc.org_id = public.current_org_id()
     and rc.deleted_at is null
     and rc.counterparty_type = p_counterparty_type
     and rc.party_id = p_party_id
     and rc.valid_from <= p_on_date
     and (rc.valid_to is null or rc.valid_to >= p_on_date)
     and (rc.route_origin_city is null or rc.route_origin_city = p_origin_city)
     and (rc.route_destination_city is null or rc.route_destination_city = p_destination_city)
     and (rc.vehicle_type is null or rc.vehicle_type = p_vehicle_type)
   order by
     -- Most specific first: route+vehicle both set outranks either alone,
     -- which outranks neither (a blanket contract).
     (case when rc.route_origin_city is not null then 1 else 0 end
      + case when rc.route_destination_city is not null then 1 else 0 end
      + case when rc.vehicle_type is not null then 1 else 0 end) desc,
     rc.valid_from desc
   limit 1;
$$;

comment on function public.lookup_rate_contract is
  'Returns {contract_id, rate, freight_basis} for the most specific matching contract, or null. A suggestion for the UI to prefill — never applied automatically.';

revoke execute on function public.lookup_rate_contract(text, uuid, text, text, text, date) from public;
grant  execute on function public.lookup_rate_contract(text, uuid, text, text, text, date) to authenticated;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop function if exists public.lookup_rate_contract(text, uuid, text, text, text, date);
-- drop table if exists public.rate_contracts;
