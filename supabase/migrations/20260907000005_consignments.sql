-- ═══════════════════════════════════════════════════════════════════════════
-- 05 · Consignments (the lorry receipt) and its POD pages
--
-- WHY: the LR is the document the whole business runs on. It is a statutory
-- record, so several choices here are about permanence rather than tidiness:
--
--  * consignor/consignee are stored BOTH as a foreign key and as a frozen
--    jsonb snapshot. If a party later corrects its address or GSTIN, every
--    previously issued LR must still reprint exactly as it was signed.
--
--  * tax amounts are plain columns, not generated ones. They depend on the
--    organisation's tax_mode and state — a cross-row lookup, which a
--    generated column cannot do (it may not reference another generated
--    column or call a non-IMMUTABLE function). They are written by
--    lib/tax.ts, the single tested implementation, and `tax_snapshot`
--    records the inputs so an audit can reproduce the figure years later.
--    The database enforces only internal consistency, below.
--
--  * `taxable_value` IS generated, and every component carries
--    `not null default 0` — a single NULL would null the whole column.
--    STORED is mandatory: PG17 has no virtual generated columns.
--
--  * status is text + CHECK, not an enum. `create type ... as enum` has no
--    IF NOT EXISTS (so it aborts a re-run mid-batch) and enum values can
--    never be removed. A named constraint drops and recreates idempotently.
--
--  * POD pages are a child table, not `pod_paths text[]`. Two devices
--    uploading at once would read-modify-write an array and silently lose a
--    page; and the array cannot carry page_no, client_id or verified_at. The
--    unique (consignment_id, client_id) index below IS the offline upload
--    queue's idempotency guarantee.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.consignments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organisations(id) on delete cascade,
  branch_id      uuid not null references public.branches(id) on delete restrict,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Identity. lr_no is allocated by a BEFORE INSERT trigger (migration 06)
  -- so allocation and insert share one transaction and no number is burned.
  -- Empty default, overwritten by the assign_lr_number BEFORE INSERT trigger
  -- (migration 06). The default exists so generated TypeScript types mark this
  -- optional on insert, which is the truth: callers never supply it.
  lr_no          text not null default '',
  lr_date        date not null default current_date,
  doc_version    integer not null default 1,
  tracking_token text not null default encode(extensions.gen_random_bytes(20), 'hex'),

  -- Parties: live reference + frozen snapshot.
  consignor_party_id uuid references public.parties(id) on delete restrict,
  consignor_snapshot jsonb not null,
  consignee_party_id uuid references public.parties(id) on delete restrict,
  consignee_snapshot jsonb not null,

  -- Route
  origin_city       text not null,
  origin_state      char(2) not null,
  destination_city  text not null,
  destination_state char(2) not null,
  distance_km       integer,

  -- Cargo
  cargo_description text not null,
  packages_count    integer not null default 1,
  packages_unit     text not null default 'pkgs',
  actual_weight_kg  numeric(10,2),
  charged_weight_kg numeric(10,2),
  declared_value    numeric(14,2) not null default 0,
  hsn_code          text,

  -- Compliance
  customer_invoice_no   text,
  customer_invoice_date date,
  ewb_no                text,
  ewb_valid_until       timestamptz,

  -- Commercials, in rupees. All arithmetic happens in integer paise in
  -- lib/money.ts; these are the persisted statutory figures.
  freight_basis  text not null default 'per_trip'
                 constraint consignments_freight_basis_chk
                 check (freight_basis in ('per_trip', 'per_ton')),
  freight_rate   numeric(12,2),
  freight        numeric(12,2) not null default 0,
  loading        numeric(12,2) not null default 0,
  unloading      numeric(12,2) not null default 0,
  detention      numeric(12,2) not null default 0,
  other_charges  numeric(12,2) not null default 0,
  taxable_value  numeric(12,2)
                 generated always as
                 (freight + loading + unloading + detention + other_charges) stored,

  -- Tax, computed by lib/tax.ts and frozen here.
  tax_mode      text not null
                constraint consignments_tax_mode_chk
                check (tax_mode in ('rcm', 'fcm_5', 'fcm_18')),
  exempt_goods  boolean not null default false,
  tax_rate_pct  numeric(4,2) not null default 0,
  cgst_amount   numeric(12,2) not null default 0,
  sgst_amount   numeric(12,2) not null default 0,
  igst_amount   numeric(12,2) not null default 0,
  invoice_total numeric(12,2) not null default 0,
  tax_snapshot  jsonb not null default '{}'::jsonb,

  freight_terms    text not null default 'to_be_billed'
                   constraint consignments_freight_terms_chk
                   check (freight_terms in ('paid', 'to_pay', 'to_be_billed')),
  advance_received numeric(12,2) not null default 0,

  -- Assignment and lifecycle
  vehicle_id uuid references public.vehicles(id) on delete restrict,
  driver_id  uuid references public.drivers(id)  on delete restrict,
  status     text not null default 'draft'
             constraint consignments_status_chk
             check (status in ('draft', 'dispatched', 'in_transit', 'delivered',
                               'pod_verified', 'invoiced', 'settled', 'cancelled')),

  dispatched_at   timestamptz,
  in_transit_at   timestamptz,
  delivered_at    timestamptz,
  pod_verified_at timestamptz,
  pod_verified_by uuid references public.profiles(id) on delete set null,
  invoiced_at     timestamptz,
  settled_at      timestamptz,
  cancelled_at    timestamptz,
  cancel_reason   text,

  delivery_instructions text,
  remarks               text,
  eta_text              text,

  -- FK added in migration 09, once freight_bills exists.
  bill_id uuid,

  -- ─── Internal consistency. The VALUES come from lib/tax.ts; the database
  -- only asserts they cannot contradict themselves. ───
  constraint consignments_tax_total_chk
    check (invoice_total = taxable_value + cgst_amount + sgst_amount + igst_amount),
  constraint consignments_tax_split_chk
    check (igst_amount = 0 or (cgst_amount = 0 and sgst_amount = 0)),
  constraint consignments_tax_nonneg_chk
    check (cgst_amount >= 0 and sgst_amount >= 0 and igst_amount >= 0),

  constraint consignments_ewb_no_chk
    check (ewb_no is null or ewb_no ~ '^[0-9]{12}$'),
  constraint consignments_origin_state_chk      check (origin_state ~ '^[0-9]{2}$'),
  constraint consignments_destination_state_chk check (destination_state ~ '^[0-9]{2}$'),
  constraint consignments_packages_chk          check (packages_count >= 1),
  constraint consignments_cancel_reason_chk
    check (status <> 'cancelled' or (cancel_reason is not null and btrim(cancel_reason) <> '')),
  constraint consignments_lr_no_present_chk check (btrim(lr_no) <> ''),
  constraint consignments_snapshots_are_objects
    check (jsonb_typeof(consignor_snapshot) = 'object' and jsonb_typeof(consignee_snapshot) = 'object')
);

comment on table public.consignments is
  'One lorry receipt. Statutory record: rows are cancelled, never deleted, and the LR number is never reused.';
comment on column public.consignments.consignor_snapshot is
  'Frozen name/GSTIN/address at the moment of issue, so a later party edit cannot alter an already-signed LR.';
comment on column public.consignments.taxable_value is
  'Generated: freight + loading + unloading + detention + other. STORED (PG17 has no virtual generated columns).';
comment on column public.consignments.tax_snapshot is
  'Inputs to lib/tax.ts at issue time {mode, supplier_state, pos_state, exempt, rate}. Lets an audit reproduce the figure after the org changes tax mode.';
comment on column public.consignments.doc_version is
  'Bumped on every material change. Forms part of the cached PDF path, so invalidation is automatic.';

-- A cancelled LR keeps its number forever: this index is deliberately NOT
-- partial on a deleted flag, so a number can never be reissued.
create unique index if not exists consignments_org_lrno_uniq
  on public.consignments (org_id, lr_no);
create unique index if not exists consignments_tracking_token_uniq
  on public.consignments (tracking_token);

create index if not exists consignments_org_status_date_idx
  on public.consignments (org_id, status, lr_date desc);
create index if not exists consignments_branch_lrno_idx
  on public.consignments (branch_id, lr_no);
create index if not exists consignments_vehicle_idx  on public.consignments (vehicle_id);
create index if not exists consignments_driver_idx   on public.consignments (driver_id);
create index if not exists consignments_bill_idx     on public.consignments (bill_id);
create index if not exists consignments_consignee_idx on public.consignments (consignee_party_id);
-- Bulk-billing picker: unbilled consignments for one consignor.
create index if not exists consignments_unbilled_consignor_idx
  on public.consignments (consignor_party_id) where bill_id is null;
-- Exceptions panel: e-way bills about to expire on a moving truck.
create index if not exists consignments_ewb_valid_idx
  on public.consignments (ewb_valid_until)
  where status in ('dispatched', 'in_transit');

drop trigger if exists consignments_updated_at on public.consignments;
create trigger consignments_updated_at before update on public.consignments
  for each row execute function public.set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- POD pages
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.consignment_pods (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organisations(id) on delete cascade,
  consignment_id   uuid not null references public.consignments(id) on delete cascade,
  page_no          integer not null default 1 constraint consignment_pods_page_chk check (page_no between 1 and 10),
  storage_path     text not null,
  -- Generated in the browser at enqueue time and never regenerated on retry.
  -- With the unique index below, a replayed upload is a no-op, not a duplicate.
  client_id        uuid not null,
  uploaded_by_type text not null default 'driver'
                   constraint consignment_pods_by_chk check (uploaded_by_type in ('driver', 'office')),
  uploaded_at      timestamptz not null default now(),
  verified_at      timestamptz,
  verified_by      uuid references public.profiles(id) on delete set null
);

create unique index if not exists consignment_pods_client_uniq
  on public.consignment_pods (consignment_id, client_id);
create index if not exists consignment_pods_consignment_idx
  on public.consignment_pods (consignment_id);

comment on table public.consignment_pods is
  'Signed delivery-challan photographs. (consignment_id, client_id) is unique: that is the offline upload queue''s idempotency guarantee.';

-- ───────────────────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────────────────
alter table public.consignments     enable row level security;
alter table public.consignment_pods enable row level security;

drop policy if exists "consignments_select" on public.consignments;
create policy "consignments_select" on public.consignments
  for select to authenticated using (org_id = (select public.current_org_id()));

drop policy if exists "consignments_insert" on public.consignments;
create policy "consignments_insert" on public.consignments
  for insert to authenticated
  with check (org_id = (select public.current_org_id())
              and (select public.has_role('owner', 'dispatcher')));

drop policy if exists "consignments_update" on public.consignments;
create policy "consignments_update" on public.consignments
  for update to authenticated
  using      (org_id = (select public.current_org_id())
              and (select public.has_role('owner', 'dispatcher', 'accounts')))
  with check (org_id = (select public.current_org_id()));

-- No DELETE policy: a consignment is cancelled, never deleted.

drop policy if exists "consignment_pods_select" on public.consignment_pods;
create policy "consignment_pods_select" on public.consignment_pods
  for select to authenticated using (org_id = (select public.current_org_id()));

drop policy if exists "consignment_pods_insert" on public.consignment_pods;
create policy "consignment_pods_insert" on public.consignment_pods
  for insert to authenticated
  with check (org_id = (select public.current_org_id())
              and (select public.has_role('owner', 'dispatcher')));

drop policy if exists "consignment_pods_update" on public.consignment_pods;
create policy "consignment_pods_update" on public.consignment_pods
  for update to authenticated
  using      (org_id = (select public.current_org_id())
              and (select public.has_role('owner', 'dispatcher', 'accounts')))
  with check (org_id = (select public.current_org_id()));

revoke all on public.consignments     from anon;
revoke all on public.consignment_pods from anon;

-- Table privileges. No DELETE: a consignment is cancelled, never deleted.
grant select, insert, update on public.consignments     to authenticated;
grant select, insert, update on public.consignment_pods to authenticated;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop table if exists public.consignment_pods;
-- drop table if exists public.consignments;
