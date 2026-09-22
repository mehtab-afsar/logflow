-- ═══════════════════════════════════════════════════════════════════════════
-- 17 · Payment ledger — consignor receivable, vendor payable
--
-- WHY: freight_bills is fire-and-forget today — raised, PDF'd, exported to
-- Tally, and then this system has no idea whether it was ever paid. There is
-- also no vendor concept at all: an "attached" (hired) vehicle has no
-- counterparty to pay. This migration closes both gaps with ONE generalized,
-- append-only postings ledger, not a copy of trip_settlement() (migration 07,
-- office↔driver only) per counterparty type.
--
-- ledger_entries rows are never updated, same "audit trail over convenience"
-- philosophy as consignment_events: outstanding is DERIVED by summing
-- (party_outstanding() below), never stored as a running balance a client
-- could get out of sync. A correction is a reversing 'adjustment' row, not an
-- UPDATE — same "credit note, not edit" reasoning used everywhere else a
-- money figure needs fixing after the fact.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- Vendor = owner of an attached/hired truck. vehicles.ownership already
-- distinguishes own/attached (migration 03) but had no counterparty — this is
-- the FK the vendor side of the ledger needs. Guarded CHECK: an owner_party_id
-- only makes sense on an attached vehicle.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.vehicles add column if not exists owner_party_id uuid references public.parties(id) on delete restrict;

comment on column public.vehicles.owner_party_id is
  'Who an attached (hired) truck is hired from — a vendor party. Null for an own vehicle. Set via the fleet form, never enforced by the state machine.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vehicles_owner_only_when_attached_chk') then
    alter table public.vehicles
      add constraint vehicles_owner_only_when_attached_chk
      check (owner_party_id is null or ownership = 'attached');
  end if;
end $$;

-- parties.party_role widens to add 'vendor'. Existing rows are untouched —
-- this only widens what future inserts/updates may set.
alter table public.parties drop constraint if exists parties_role_chk;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'parties_role_chk') then
    alter table public.parties
      add constraint parties_role_chk
      check (party_role in ('consignor', 'consignee', 'both', 'vendor'));
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- consignment_events.kind gains 'payment_recorded', so a payment leaves the
-- same audit trail every other write already does. Same drop-then-guarded-add
-- shape as the parties widen above.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.consignment_events drop constraint if exists consignment_events_kind_chk;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'consignment_events_kind_chk') then
    alter table public.consignment_events
      add constraint consignment_events_kind_chk
      check (kind in ('status_change', 'milestone', 'note', 'pod_uploaded', 'expense_added', 'payment_recorded'));
  end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- ledger_entries: append-only postings. 'charge' rows increase what is owed
-- (a bill raised, a vendor payable accrued); 'payment' rows decrease it. The
-- direction (receivable = consignor owes us, payable = we owe a vendor) is
-- redundant with counterparty_type today but kept explicit and separately
-- checked — a future counterparty type must not silently guess a direction.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.ledger_entries (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organisations(id) on delete cascade,
  counterparty_type  text not null
                     constraint ledger_entries_counterparty_type_chk
                     check (counterparty_type in ('consignor', 'vendor')),
  party_id           uuid not null references public.parties(id) on delete restrict,
  direction          text not null
                     constraint ledger_entries_direction_chk
                     check (direction in ('receivable', 'payable')),
  ref_type           text not null
                     constraint ledger_entries_ref_type_chk
                     check (ref_type in ('bill', 'trip', 'advance', 'adjustment')),
  -- freight_bills.id when ref_type='bill'; consignments.id when ref_type=
  -- 'trip' (a vendor payable accrued against that trip). Null for a
  -- standalone advance or adjustment — no single row it is "against".
  ref_id             uuid,
  entry_type         text not null
                     constraint ledger_entries_entry_type_chk
                     check (entry_type in ('charge', 'payment')),
  amount             numeric(12,2) not null check (amount > 0),
  -- Null when entry_type='charge' — a charge has no payment mode.
  payment_mode       text
                     constraint ledger_entries_payment_mode_chk
                     check (payment_mode is null or payment_mode in ('cash', 'bank_transfer', 'upi', 'cheque', 'other')),
  reference_no       text,
  notes              text,
  entered_by         uuid references public.profiles(id) on delete set null,
  entered_at         timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  constraint ledger_entries_consistency_chk
    check (
      (counterparty_type = 'consignor' and direction = 'receivable')
      or (counterparty_type = 'vendor' and direction = 'payable')
    ),
  constraint ledger_entries_payment_mode_present_chk
    check ((entry_type = 'payment') = (payment_mode is not null))
);

create index if not exists ledger_entries_org_party_idx
  on public.ledger_entries (org_id, party_id);
create index if not exists ledger_entries_ref_idx
  on public.ledger_entries (ref_type, ref_id);

comment on table public.ledger_entries is
  'Append-only money postings — receivable from a consignor, payable to a vendor. Outstanding is derived (party_outstanding()), never stored. Only record_payment()/record_vendor_charge()/create_bill() write this table.';

alter table public.ledger_entries enable row level security;

drop policy if exists "ledger_entries_select" on public.ledger_entries;
create policy "ledger_entries_select" on public.ledger_entries
  for select to authenticated using (org_id = (select public.current_org_id()));

-- No insert/update/delete policy for authenticated at all — same
-- deny-all-but-RPC shape as consignment_events (migration 06) and
-- lr_blank_reservations (migration 13). Every write goes through
-- create_bill(), record_payment() or record_vendor_charge() below.
revoke all on public.ledger_entries from anon;
grant select on public.ledger_entries to authenticated;
revoke insert, update, delete on public.ledger_entries from authenticated;

-- Migration 12's blanket `grant ... to service_role` is a one-time snapshot —
-- does not retroactively cover a table created here. Same fix as
-- charge_types, rate_contracts, lr_blank_reservations, org_invites before it.
grant all privileges on public.ledger_entries to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- create_bill(): CREATE OR REPLACE, same signature as migration 09, full
-- original body plus one more insert in the same transaction — a 'charge'/
-- 'receivable' ledger row for the bill just raised. Same "one writer, one
-- transaction" discipline the function already had; the refactor precedent
-- (redefining an existing SECURITY DEFINER function in a later migration via
-- CREATE OR REPLACE, same signature) is office_recorded_events.sql
-- (migration 14) extracting _record_milestone()/_register_pod() from
-- driver_milestone()/driver_register_pod().
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.create_bill(
  p_branch_id       uuid,
  p_party_id        uuid,
  p_consignment_ids uuid[],
  p_bill_date       date,
  p_tax             jsonb,
  p_notes           text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org     uuid := public.current_org_id();
  v_bill_id uuid;
  v_no      text;
  v_n       integer;
  v_want    integer := coalesce(array_length(p_consignment_ids, 1), 0);
  v_party   jsonb;
  v_total   numeric;
begin
  if v_org is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.has_role('owner', 'accounts') then
    raise exception 'raising a bill requires the owner or accounts role' using errcode = '42501';
  end if;
  if v_want = 0 then
    raise exception 'select at least one consignment' using errcode = '23514';
  end if;

  select count(*) into v_n
    from (
      select c.id
        from public.consignments c
       where c.id = any(p_consignment_ids)
         and c.org_id = v_org
         and c.branch_id = p_branch_id
         and c.consignor_party_id = p_party_id
         and c.status = 'pod_verified'
         and c.bill_id is null
       for update
    ) locked;

  if v_n <> v_want then
    raise exception
      'some consignments are not billable: they must all be POD-verified, unbilled, in the same branch and for the same consignor'
      using errcode = '23514';
  end if;

  v_no := public.next_doc_number(p_branch_id, 'INV', p_bill_date);

  select jsonb_build_object('name', p.name, 'gstin', p.gstin,
                            'state_code', p.state_code, 'addresses', p.addresses)
    into v_party
    from public.parties p where p.id = p_party_id;

  v_total := (p_tax->>'total')::numeric;

  insert into public.freight_bills (
    org_id, branch_id, bill_no, bill_date, party_id, party_snapshot,
    taxable_value, tax_mode, tax_rate_pct,
    cgst_amount, sgst_amount, igst_amount, total_amount, tax_snapshot,
    notes, created_by
  ) values (
    v_org, p_branch_id, v_no, p_bill_date, p_party_id, coalesce(v_party, '{}'::jsonb),
    (p_tax->>'taxable_value')::numeric,
    p_tax->>'tax_mode',
    coalesce((p_tax->>'rate_pct')::numeric, 0),
    coalesce((p_tax->>'cgst')::numeric, 0),
    coalesce((p_tax->>'sgst')::numeric, 0),
    coalesce((p_tax->>'igst')::numeric, 0),
    v_total, p_tax, p_notes, (select auth.uid())
  )
  returning id into v_bill_id;

  insert into public.bill_lines (bill_id, consignment_id, amount)
  select v_bill_id, c.id, c.taxable_value
    from public.consignments c where c.id = any(p_consignment_ids);

  update public.consignments
     set bill_id     = v_bill_id,
         status      = 'invoiced',
         invoiced_at = now()
   where id = any(p_consignment_ids);

  insert into public.consignment_events (
    org_id, consignment_id, kind, from_status, to_status,
    event_time, payload, actor_type, actor_user_id
  )
  select v_org, c.id, 'status_change', 'pod_verified', 'invoiced',
         now(), jsonb_build_object('bill_id', v_bill_id, 'bill_no', v_no),
         'staff', (select auth.uid())
    from public.consignments c where c.id = any(p_consignment_ids);

  -- New in migration 17: the receivable this bill creates, posted in the
  -- same transaction as everything above — if any of this fails, none of it
  -- lands, including the ledger row.
  insert into public.ledger_entries (
    org_id, counterparty_type, party_id, direction, ref_type, ref_id,
    entry_type, amount, entered_by
  ) values (
    v_org, 'consignor', p_party_id, 'receivable', 'bill', v_bill_id,
    'charge', v_total, (select auth.uid())
  );

  return jsonb_build_object('bill_id', v_bill_id, 'bill_no', v_no, 'lines', v_want);
end;
$$;

revoke execute on function public.create_bill(uuid, uuid, uuid[], date, jsonb, text) from public;
grant  execute on function public.create_bill(uuid, uuid, uuid[], date, jsonb, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- record_vendor_charge: accrues what we owe a vendor for one trip. Manual
-- (accounts-triggered) rather than automatic — unlike a consignor bill, no
-- single state-machine event "closes" a vendor's payable; the office decides
-- when the hire is finalized, typically after checking lookup_rate_contract()
-- (migration 16) for a suggested amount.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.record_vendor_charge(
  p_party_id        uuid,
  p_consignment_id  uuid,
  p_amount          numeric,
  p_notes           text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.current_org_id();
  v_id  uuid;
begin
  if v_org is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.has_role('owner', 'accounts') then
    raise exception 'recording a vendor charge requires the owner or accounts role' using errcode = '42501';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '23514';
  end if;

  -- The vendor must actually own the attached vehicle on this trip — this is
  -- what closes the loop with vehicles.owner_party_id above. Also confirms
  -- the consignment belongs to this org, so a foreign id is a clean 404-style
  -- "not found", not a 403.
  if not exists (
    select 1
      from public.consignments c
      join public.vehicles v on v.id = c.vehicle_id
     where c.id = p_consignment_id
       and c.org_id = v_org
       and v.ownership = 'attached'
       and v.owner_party_id = p_party_id
  ) then
    raise exception 'this vendor does not own the attached vehicle on this consignment' using errcode = 'P0002';
  end if;

  insert into public.ledger_entries (
    org_id, counterparty_type, party_id, direction, ref_type, ref_id,
    entry_type, amount, notes, entered_by
  ) values (
    v_org, 'vendor', p_party_id, 'payable', 'trip', p_consignment_id,
    'charge', p_amount, p_notes, (select auth.uid())
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end;
$$;

revoke execute on function public.record_vendor_charge(uuid, uuid, numeric, text) from public;
grant  execute on function public.record_vendor_charge(uuid, uuid, numeric, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- record_payment: a payment received from a consignor, or paid to a vendor —
-- an advance or a full settlement are both just this, no separate concept.
-- When ref_type='bill', also writes a 'payment_recorded' consignment_events
-- row on every consignment that bill covers, so the office timeline (and, in
-- a later step, the customer dashboard) shows it without a ledger join.
-- ───────────────────────────────────────────────────────────────────────────
-- p_ref_id is nullable — a standalone advance or adjustment has no single
-- row it is "against" — so it (and the other optional params) must sort
-- after every required one; Postgres requires all defaulted parameters to
-- come last.
create or replace function public.record_payment(
  p_counterparty_type text,
  p_party_id          uuid,
  p_ref_type          text,
  p_amount            numeric,
  p_payment_mode      text,
  p_ref_id            uuid default null,
  p_reference_no      text default null,
  p_notes             text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org       uuid := public.current_org_id();
  v_id        uuid;
  v_direction text;
begin
  if v_org is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.has_role('owner', 'accounts') then
    raise exception 'recording a payment requires the owner or accounts role' using errcode = '42501';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '23514';
  end if;
  if p_counterparty_type not in ('consignor', 'vendor') then
    raise exception 'unknown counterparty type' using errcode = '23514';
  end if;

  if not exists (select 1 from public.parties where id = p_party_id and org_id = v_org) then
    raise exception 'party not found' using errcode = 'P0002';
  end if;

  v_direction := case p_counterparty_type when 'consignor' then 'receivable' else 'payable' end;

  insert into public.ledger_entries (
    org_id, counterparty_type, party_id, direction, ref_type, ref_id,
    entry_type, amount, payment_mode, reference_no, notes, entered_by
  ) values (
    v_org, p_counterparty_type, p_party_id, v_direction, p_ref_type, p_ref_id,
    'payment', p_amount, p_payment_mode, p_reference_no, p_notes, (select auth.uid())
  )
  returning id into v_id;

  if p_ref_type = 'bill' then
    insert into public.consignment_events (
      org_id, consignment_id, kind, event_time, payload, actor_type, actor_user_id
    )
    select v_org, bl.consignment_id, 'payment_recorded', now(),
           jsonb_build_object('bill_id', p_ref_id, 'amount', p_amount, 'payment_mode', p_payment_mode),
           'staff', (select auth.uid())
      from public.bill_lines bl where bl.bill_id = p_ref_id;
  end if;

  return jsonb_build_object('id', v_id);
end;
$$;

revoke execute on function public.record_payment(text, uuid, text, numeric, text, uuid, text, text) from public;
grant  execute on function public.record_payment(text, uuid, text, numeric, text, uuid, text, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- party_outstanding: the ledger's equivalent of trip_settlement() (migration
-- 07) — sums charges/payments per direction for one party, computed live,
-- never persisted.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.party_outstanding(p_party_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'party_id', p_party_id,
    'direction', min(le.direction),
    'total_charged', coalesce(sum(le.amount) filter (where le.entry_type = 'charge'), 0),
    'total_paid', coalesce(sum(le.amount) filter (where le.entry_type = 'payment'), 0),
    'outstanding',
      coalesce(sum(le.amount) filter (where le.entry_type = 'charge'), 0)
      - coalesce(sum(le.amount) filter (where le.entry_type = 'payment'), 0),
    'entries', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', le.id, 'entry_type', le.entry_type, 'ref_type', le.ref_type, 'ref_id', le.ref_id,
          'amount', le.amount, 'payment_mode', le.payment_mode, 'reference_no', le.reference_no,
          'entered_at', le.entered_at
        )
        order by le.entered_at desc
      ) filter (where le.id is not null),
      '[]'::jsonb
    )
  )
    from public.ledger_entries le
   where le.party_id = p_party_id
     and le.org_id = public.current_org_id();
$$;

comment on function public.party_outstanding is
  'Live-computed outstanding for one party — never stored. direction is null (no entries yet) until the party''s first ledger row.';

revoke execute on function public.party_outstanding(uuid) from public;
grant  execute on function public.party_outstanding(uuid) to authenticated;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop function if exists public.party_outstanding(uuid);
-- drop function if exists public.record_payment(text, uuid, text, numeric, text, uuid, text, text);
-- drop function if exists public.record_vendor_charge(uuid, uuid, numeric, text);
-- drop table if exists public.ledger_entries;
-- alter table public.consignments drop constraint if exists vehicles_owner_only_when_attached_chk;
-- alter table public.vehicles drop column if exists owner_party_id;
