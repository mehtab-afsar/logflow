-- ═══════════════════════════════════════════════════════════════════════════
-- 09 · Freight bills
--
-- WHY: the whole product exists to close the gap between "truck unloaded" and
-- "invoice raised". This is the last link.
--
-- Double-billing is made STRUCTURALLY impossible rather than merely checked:
-- bill_lines has a unique index on consignment_id, so a consignment can appear
-- on at most one bill ever, regardless of what any application code does.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.freight_bills (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations(id) on delete cascade,
  branch_id     uuid not null references public.branches(id) on delete restrict,
  bill_no       text not null,
  bill_date     date not null default current_date,
  party_id      uuid not null references public.parties(id) on delete restrict,
  party_snapshot jsonb not null default '{}'::jsonb,
  taxable_value numeric(14,2) not null default 0,
  tax_mode      text not null
                constraint freight_bills_tax_mode_chk check (tax_mode in ('rcm', 'fcm_5', 'fcm_18')),
  tax_rate_pct  numeric(4,2) not null default 0,
  cgst_amount   numeric(14,2) not null default 0,
  sgst_amount   numeric(14,2) not null default 0,
  igst_amount   numeric(14,2) not null default 0,
  total_amount  numeric(14,2) not null default 0,
  tax_snapshot  jsonb not null default '{}'::jsonb,
  notes         text,
  pdf_path      text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint freight_bills_total_chk
    check (total_amount = taxable_value + cgst_amount + sgst_amount + igst_amount),
  constraint freight_bills_split_chk
    check (igst_amount = 0 or (cgst_amount = 0 and sgst_amount = 0))
);

create unique index if not exists freight_bills_org_no_uniq on public.freight_bills (org_id, bill_no);
create index if not exists freight_bills_org_date_idx on public.freight_bills (org_id, bill_date desc);
create index if not exists freight_bills_party_idx on public.freight_bills (party_id);

comment on table public.freight_bills is
  'One freight bill, covering one or many consignments for a single consignor.';

create table if not exists public.bill_lines (
  id             uuid primary key default gen_random_uuid(),
  bill_id        uuid not null references public.freight_bills(id) on delete cascade,
  consignment_id uuid not null references public.consignments(id) on delete restrict,
  amount         numeric(12,2) not null
);

-- The structural guarantee: a consignment can be billed at most once, ever.
create unique index if not exists bill_lines_consignment_uniq on public.bill_lines (consignment_id);
create index if not exists bill_lines_bill_idx on public.bill_lines (bill_id);

comment on index public.bill_lines_consignment_uniq is
  'Makes double-billing impossible at the storage layer, not merely unlikely at the application layer.';

drop trigger if exists freight_bills_updated_at on public.freight_bills;
create trigger freight_bills_updated_at before update on public.freight_bills
  for each row execute function public.set_updated_at();

-- consignments.bill_id could not be a FK in migration 05 because this table
-- did not exist yet. PG17 has no ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS,
-- so it must be guarded explicitly or a re-run aborts the batch.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'consignments_bill_fk') then
    alter table public.consignments
      add constraint consignments_bill_fk
      foreign key (bill_id) references public.freight_bills(id) on delete set null;
  end if;
end $$;

alter table public.freight_bills enable row level security;
alter table public.bill_lines    enable row level security;

drop policy if exists "freight_bills_select" on public.freight_bills;
create policy "freight_bills_select" on public.freight_bills
  for select to authenticated using (org_id = (select public.current_org_id()));

drop policy if exists "freight_bills_insert" on public.freight_bills;
create policy "freight_bills_insert" on public.freight_bills
  for insert to authenticated
  with check (org_id = (select public.current_org_id())
              and (select public.has_role('owner', 'accounts')));

drop policy if exists "freight_bills_update" on public.freight_bills;
create policy "freight_bills_update" on public.freight_bills
  for update to authenticated
  using      (org_id = (select public.current_org_id())
              and (select public.has_role('owner', 'accounts')))
  with check (org_id = (select public.current_org_id()));

drop policy if exists "bill_lines_select" on public.bill_lines;
create policy "bill_lines_select" on public.bill_lines
  for select to authenticated
  using (exists (select 1 from public.freight_bills b
                  where b.id = bill_lines.bill_id
                    and b.org_id = (select public.current_org_id())));

revoke all on public.freight_bills from anon;
revoke all on public.bill_lines    from anon;
-- bill_lines are written only by create_bill().
revoke insert, update, delete on public.bill_lines from authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- create_bill: allocate a number, write the bill and its lines, flip every
-- consignment to `invoiced`, and log an event for each — in one transaction.
--
-- Re-validates everything server-side under FOR UPDATE. Never trusts the
-- route handler's earlier read: two dispatchers clicking at the same instant
-- must not both succeed.
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

  -- Lock and re-validate. A consignment qualifies only if it is in this org
  -- and branch, for this consignor, POD-verified, and not already billed.
  -- FOR UPDATE cannot appear alongside an aggregate, so lock inside a
  -- subquery and count outside it. The lock is what stops two dispatchers
  -- billing the same consignments concurrently.
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
    (p_tax->>'total')::numeric,
    p_tax, p_notes, (select auth.uid())
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

  return jsonb_build_object('bill_id', v_bill_id, 'bill_no', v_no, 'lines', v_want);
end;
$$;

revoke execute on function public.create_bill(uuid, uuid, uuid[], date, jsonb, text) from public;
grant  execute on function public.create_bill(uuid, uuid, uuid[], date, jsonb, text) to authenticated;

-- Table privileges. bill_lines is read-only: only create_bill() writes it.
grant select, insert, update on public.freight_bills to authenticated;
grant select                 on public.bill_lines    to authenticated;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop function if exists public.create_bill(uuid, uuid, uuid[], date, jsonb, text);
-- alter table public.consignments drop constraint if exists consignments_bill_fk;
-- drop table if exists public.bill_lines;
-- drop table if exists public.freight_bills;
