-- ═══════════════════════════════════════════════════════════════════════════
-- 18 · Customer accounts — a read-only, party-scoped login
--
-- WHY: today's access model is strictly binary — full staff login
-- (profiles, org-scoped) or a one-off anonymous token link scoped to a single
-- consignment (tracking_token) or single trip (access_tokens, driver only),
-- both of which deliberately exclude every money field. A dashboard showing
-- a consignor their own outstanding balance is money-sensitive, so it cannot
-- honestly be another anonymous token — it needs a real session, scoped by
-- RLS the same way staff already are, just to a narrower role.
--
-- customer_accounts is a SEPARATE table from profiles, not an extension of
-- it. profiles' own comment says "Staff only" — that stays literally true: a
-- customer gets a real auth.users row (Supabase Auth requires one for a
-- magic-link session) but never a profiles row. Every existing RLS policy
-- and helper (current_org_id(), has_role(), verifyAuth()) keys off profiles,
-- so a customer session with no profiles row makes current_org_id() return
-- null and every staff policy silently (and correctly) denies them — no
-- staff policy needs to change, and this migration adds POLICIES, never
-- replaces one.
-- ═══════════════════════════════════════════════════════════════════════════

comment on table public.profiles is
  'Staff only. Drivers never get an auth account. Customers get a real auth.users row (magic-link) but never a row HERE — see customer_accounts, a deliberately separate table.';

create table if not exists public.customer_accounts (
  id         uuid primary key references auth.users(id) on delete cascade,
  org_id     uuid not null references public.organisations(id) on delete cascade,
  -- Which consignor this login represents. A party could plausibly have more
  -- than one login (an owner and an accounts contact both wanting access),
  -- so this is not unique on its own.
  party_id   uuid not null references public.parties(id) on delete restrict,
  full_name  text,
  phone      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_accounts_party_idx on public.customer_accounts (party_id);
create index if not exists customer_accounts_org_idx   on public.customer_accounts (org_id);

comment on table public.customer_accounts is
  'A consignor-facing login, party-scoped and read-only everywhere else in the schema (see the additive SELECT policies below). Provisioned by staff via an "invite to portal" action — never self-signup.';

drop trigger if exists customer_accounts_updated_at on public.customer_accounts;
create trigger customer_accounts_updated_at before update on public.customer_accounts
  for each row execute function public.set_updated_at();

-- customer_accounts itself is staff-readable (so the party detail page can
-- show "invited" / "not invited") and readable by a customer to their OWN
-- row only (verifyCustomerAuth() needs this — it is how a session resolves
-- itself to a party in the first place) — never writable by either.
alter table public.customer_accounts enable row level security;

drop policy if exists "customer_accounts_select_staff" on public.customer_accounts;
create policy "customer_accounts_select_staff" on public.customer_accounts
  for select to authenticated using (org_id = (select public.current_org_id()));

drop policy if exists "customer_accounts_select_self" on public.customer_accounts;
create policy "customer_accounts_select_self" on public.customer_accounts
  for select to authenticated using (id = (select auth.uid()));

revoke all on public.customer_accounts from anon;
grant select on public.customer_accounts to authenticated;
-- No insert/update/delete policy for authenticated — provisioning goes
-- through invite_customer_account() below (service-role, after a staff
-- caller is verified), same "no direct table write" shape as every other
-- SECURITY DEFINER-only table in this schema.
grant all privileges on public.customer_accounts to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- current_customer_party_id(): same anti-recursion reasoning as
-- current_org_id() (migration 02) — a policy on customer_accounts cannot
-- read customer_accounts to check itself without this being SECURITY
-- DEFINER. Returns null for a staff session (no customer_accounts row),
-- which is exactly what makes every additive policy below inert for staff.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.current_customer_party_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select party_id from public.customer_accounts where id = (select auth.uid())
$$;

comment on function public.current_customer_party_id() is
  'Null for a staff session. Every customer-tier RLS policy keys off this, additively — the existing staff policies are untouched.';

-- Same as current_org_id() (migration 02): evaluating a policy's USING
-- clause still executes this function AS the querying role, so it needs an
-- explicit grant to authenticated — revoke-from-public alone leaves every
-- policy that calls it failing with "permission denied for function",
-- not silently falling through to deny-all.
revoke execute on function public.current_customer_party_id() from public;
grant  execute on function public.current_customer_party_id() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- Additive SELECT policies. Postgres OR-s policies on the same table
-- together — these are a SECOND policy alongside the existing staff one, not
-- a replacement, and a staff session (current_customer_party_id() = null)
-- never matches them. No write policy for this role anywhere — read-only.
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists "consignments_select_customer" on public.consignments;
create policy "consignments_select_customer" on public.consignments
  for select to authenticated using (consignor_party_id = (select public.current_customer_party_id()));

drop policy if exists "consignment_events_select_customer" on public.consignment_events;
create policy "consignment_events_select_customer" on public.consignment_events
  for select to authenticated using (
    exists (
      select 1 from public.consignments c
       where c.id = consignment_events.consignment_id
         and c.consignor_party_id = (select public.current_customer_party_id())
    )
  );

drop policy if exists "freight_bills_select_customer" on public.freight_bills;
create policy "freight_bills_select_customer" on public.freight_bills
  for select to authenticated using (party_id = (select public.current_customer_party_id()));

drop policy if exists "bill_lines_select_customer" on public.bill_lines;
create policy "bill_lines_select_customer" on public.bill_lines
  for select to authenticated using (
    exists (
      select 1 from public.freight_bills b
       where b.id = bill_lines.bill_id
         and b.party_id = (select public.current_customer_party_id())
    )
  );

-- Deliberately NOT added: a customer-facing ledger_entries policy. A
-- customer only ever needs their own outstanding total, never the line-item
-- postings table — customer_outstanding() below serves that, scoped
-- server-side, so there is one fewer table surface to reason about.

-- ───────────────────────────────────────────────────────────────────────────
-- invite_customer_account: provisions a login for a party. Staff-only
-- (owner/dispatcher — same roles that can create a party in the first
-- place); the actual auth.users row is created by the service-role caller
-- (app/api/parties/[id]/invite-customer/route.ts) using
-- supabase.auth.admin.inviteUserByEmail AFTER this function confirms the
-- caller is authorised — same "service role only after the caller is
-- authorised" shape as every other legitimate service-role use in this app
-- (POD upload, signed URLs, the PDF cache).
--
-- This function itself only inserts the customer_accounts row once the
-- auth.users id exists; the route calls it after inviteUserByEmail succeeds.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.link_customer_account(
  p_user_id  uuid,
  p_party_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.current_org_id();
begin
  if v_org is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.has_role('owner', 'dispatcher') then
    raise exception 'inviting a customer requires the owner or dispatcher role' using errcode = '42501';
  end if;
  if not exists (select 1 from public.parties where id = p_party_id and org_id = v_org) then
    raise exception 'party not found' using errcode = 'P0002';
  end if;

  insert into public.customer_accounts (id, org_id, party_id)
  values (p_user_id, v_org, p_party_id)
  on conflict (id) do update set party_id = excluded.party_id;

  return jsonb_build_object('id', p_user_id, 'party_id', p_party_id);
end;
$$;

revoke execute on function public.link_customer_account(uuid, uuid) from public;
grant  execute on function public.link_customer_account(uuid, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- customer_outstanding(): the customer tier's equivalent of
-- party_outstanding() (migration 17) — deliberately zero-argument. A
-- version taking p_party_id would let a compromised client substitute
-- another party's id; reading current_customer_party_id() internally means
-- there is no parameter to substitute. Also note party_outstanding() itself
-- is unreachable-but-harmless to a customer session even if called directly:
-- it filters on current_org_id(), which is null with no profiles row, so it
-- always returns nothing for them.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.customer_outstanding()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total_charged', coalesce(sum(le.amount) filter (where le.entry_type = 'charge'), 0),
    'total_paid', coalesce(sum(le.amount) filter (where le.entry_type = 'payment'), 0),
    'outstanding',
      coalesce(sum(le.amount) filter (where le.entry_type = 'charge'), 0)
      - coalesce(sum(le.amount) filter (where le.entry_type = 'payment'), 0)
  )
    from public.ledger_entries le
   where le.party_id = public.current_customer_party_id();
$$;

revoke execute on function public.customer_outstanding() from public;
grant  execute on function public.customer_outstanding() to authenticated;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop function if exists public.customer_outstanding();
-- drop function if exists public.link_customer_account(uuid, uuid);
-- drop policy if exists "bill_lines_select_customer" on public.bill_lines;
-- drop policy if exists "freight_bills_select_customer" on public.freight_bills;
-- drop policy if exists "consignment_events_select_customer" on public.consignment_events;
-- drop policy if exists "consignments_select_customer" on public.consignments;
-- drop function if exists public.current_customer_party_id();
-- drop table if exists public.customer_accounts;
