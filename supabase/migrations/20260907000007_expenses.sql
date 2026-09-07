-- ═══════════════════════════════════════════════════════════════════════════
-- 07 · Trip expenses and settlement
--
-- WHY: driver advances are the single most common source of end-of-trip
-- argument. The owner hands over ₹10,000 at dispatch, the driver buys diesel
-- and pays tolls, and three weeks later nobody can reconstruct the numbers.
-- A ledger with a receipt photograph per line settles it.
--
-- client_id + the unique index below make the driver's offline queue safe to
-- retry: a replayed expense is a no-op, not a duplicate line.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.trip_expenses (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organisations(id) on delete cascade,
  consignment_id  uuid not null references public.consignments(id) on delete cascade,
  kind            text not null
                  constraint trip_expenses_kind_chk
                  check (kind in ('advance', 'diesel', 'toll', 'loading',
                                  'unloading', 'halting', 'other')),
  amount          numeric(12,2) not null
                  constraint trip_expenses_amount_chk check (amount >= 0),
  litres          numeric(8,2),
  paid_by         text not null default 'office'
                  constraint trip_expenses_paid_by_chk check (paid_by in ('office', 'driver')),
  receipt_path    text,
  note            text,
  entered_by_type text not null default 'staff'
                  constraint trip_expenses_entered_by_chk check (entered_by_type in ('driver', 'staff')),
  entered_by      uuid references public.profiles(id) on delete set null,
  -- Browser-generated at enqueue; the offline queue's idempotency key.
  client_id       uuid not null default gen_random_uuid(),
  spent_at        timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  constraint trip_expenses_litres_chk
    check (litres is null or kind = 'diesel')
);

create unique index if not exists trip_expenses_client_uniq
  on public.trip_expenses (consignment_id, client_id);
create index if not exists trip_expenses_consignment_idx
  on public.trip_expenses (consignment_id);
create index if not exists trip_expenses_org_kind_idx
  on public.trip_expenses (org_id, kind);

comment on table public.trip_expenses is
  'Advance and running costs per trip. (consignment_id, client_id) is unique so a retried offline submission cannot duplicate a line.';
comment on column public.trip_expenses.paid_by is
  'Who actually paid. Drives the settlement: office-paid advances are recovered, driver-paid expenses are reimbursed.';

alter table public.trip_expenses enable row level security;

drop policy if exists "trip_expenses_select" on public.trip_expenses;
create policy "trip_expenses_select" on public.trip_expenses
  for select to authenticated using (org_id = (select public.current_org_id()));

drop policy if exists "trip_expenses_insert" on public.trip_expenses;
create policy "trip_expenses_insert" on public.trip_expenses
  for insert to authenticated
  with check (org_id = (select public.current_org_id())
              and (select public.has_role('owner', 'dispatcher', 'accounts')));

drop policy if exists "trip_expenses_update" on public.trip_expenses;
create policy "trip_expenses_update" on public.trip_expenses
  for update to authenticated
  using      (org_id = (select public.current_org_id())
              and (select public.has_role('owner', 'dispatcher', 'accounts')))
  with check (org_id = (select public.current_org_id()));

drop policy if exists "trip_expenses_delete" on public.trip_expenses;
create policy "trip_expenses_delete" on public.trip_expenses
  for delete to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role('owner')));

revoke all on public.trip_expenses from anon;

-- ───────────────────────────────────────────────────────────────────────────
-- trip_settlement: the arithmetic the owner and driver argue about.
--
--   office_advance  money the office handed the driver
--   driver_paid     expenses the driver funded from his own pocket
--   driver_balance  positive → the office owes the driver
--                   negative → the driver owes the office
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.trip_settlement(p_consignment_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c               public.consignments;
  v_office_adv    numeric := 0;
  v_driver_paid   numeric := 0;
  v_office_paid   numeric := 0;
  v_lines         jsonb;
begin
  select * into c from public.consignments
   where id = p_consignment_id and org_id = public.current_org_id();
  if not found then
    raise exception 'consignment not found' using errcode = 'P0002';
  end if;

  select
    coalesce(sum(amount) filter (where kind = 'advance' and paid_by = 'office'), 0),
    coalesce(sum(amount) filter (where kind <> 'advance' and paid_by = 'driver'), 0),
    coalesce(sum(amount) filter (where kind <> 'advance' and paid_by = 'office'), 0)
  into v_office_adv, v_driver_paid, v_office_paid
  from public.trip_expenses where consignment_id = c.id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'kind', e.kind, 'amount', e.amount, 'litres', e.litres,
           'paid_by', e.paid_by, 'note', e.note, 'spent_at', e.spent_at,
           'has_receipt', e.receipt_path is not null
         ) order by e.spent_at asc), '[]'::jsonb)
    into v_lines
    from public.trip_expenses e where e.consignment_id = c.id;

  return jsonb_build_object(
    'consignment_id',  c.id,
    'lr_no',           c.lr_no,
    'freight',         c.taxable_value,
    'invoice_total',   c.invoice_total,
    'customer_advance', c.advance_received,
    'office_advance',  v_office_adv,
    'driver_paid',     v_driver_paid,
    'office_paid',     v_office_paid,
    -- What the office still owes the driver, after recovering the advance.
    'driver_balance',  v_driver_paid - v_office_adv,
    'lines',           v_lines
  );
end;
$$;

revoke execute on function public.trip_settlement(uuid) from public;
grant  execute on function public.trip_settlement(uuid) to authenticated;

-- Table privileges. DELETE is granted but the policy restricts it to owners.
grant select, insert, update, delete on public.trip_expenses to authenticated;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop function if exists public.trip_settlement(uuid);
-- drop table if exists public.trip_expenses;
