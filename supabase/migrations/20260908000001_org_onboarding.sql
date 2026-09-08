-- ═══════════════════════════════════════════════════════════════════════════
-- 14 · Org onboarding: creating the first organisation, inviting the rest
--
-- WHY THIS NEEDS ITS OWN FUNCTIONS: RLS cannot authorise either of the two
-- inserts a new company needs.
--
--   create_organisation — a brand-new auth.users row has no profiles row yet,
--   so current_org_id() is null and has_role() is false. profiles_insert's
--   own policy (migration 02) requires the inserter to already be owner of
--   the org they are inserting into — a fresh signup can satisfy that for no
--   org that exists yet. The organisation, its first branch and the caller's
--   own owner profile must therefore be created by a SECURITY DEFINER
--   function whose authorisation is "this auth.uid() has no profile yet",
--   not a row policy.
--
--   accept_org_invite — the same problem for a second person: the invitee's
--   own profiles_insert would need has_role('owner'), which they do not have
--   until the insert happens. The function checks the invite instead of the
--   caller's role.
--
-- Both follow the exact shape of current_org_id() / next_doc_number()
-- (migrations 02, 04): security definer, set search_path = '', internal
-- checks standing in for RLS, execute revoked from public and granted only to
-- authenticated — never anon.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.create_organisation(
  p_legal_name           text,
  p_gstin                text,
  p_transin              text,
  p_pan                  text,
  p_state_code           text,
  p_address              text,
  p_tax_mode             text,
  p_risk_clause          text,
  p_branch_name          text,
  p_branch_city          text,
  p_lr_prefix            text,
  p_inv_prefix           text,
  p_lr_starting_number   integer default 0,
  p_inv_starting_number  integer default 0
)
returns table (org_id uuid, branch_id uuid)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_org_id    uuid;
  v_branch_id uuid;
  v_fy        text;
begin
  if v_uid is null then
    raise exception 'create_organisation: no authenticated user' using errcode = '28000';
  end if;

  -- The one piece of authorisation this function needs: nobody may create a
  -- second organisation for an account that already belongs to one.
  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'create_organisation: this account already belongs to an organisation'
      using errcode = '23505';
  end if;

  v_fy := public.fy_code(current_date);

  insert into public.organisations
    (legal_name, gstin, transin, pan, state_code, address, tax_mode, risk_clause)
  values
    (p_legal_name, nullif(p_gstin, ''), nullif(p_transin, ''), nullif(p_pan, ''),
     p_state_code, p_address, p_tax_mode, p_risk_clause)
  returning id into v_org_id;

  insert into public.branches (org_id, name, city, state_code, lr_prefix, inv_prefix)
  values (v_org_id, p_branch_name, p_branch_city, p_state_code, p_lr_prefix, p_inv_prefix)
  returning id into v_branch_id;

  insert into public.profiles (id, org_id, full_name, role)
  values (
    v_uid,
    v_org_id,
    (select raw_user_meta_data ->> 'full_name' from auth.users where id = v_uid),
    'owner'
  );

  -- A transporter switching off a paper LR book continues their real
  -- sequence instead of restarting at 1 and colliding, in the customer's own
  -- eyes, with numbers already issued this financial year on paper.
  if p_lr_starting_number > 0 then
    insert into public.document_sequences (branch_id, doc_type, fy, last_value)
    values (v_branch_id, 'LR', v_fy, p_lr_starting_number);
  end if;
  if p_inv_starting_number > 0 then
    insert into public.document_sequences (branch_id, doc_type, fy, last_value)
    values (v_branch_id, 'INV', v_fy, p_inv_starting_number);
  end if;

  return query select v_org_id, v_branch_id;
end;
$$;

comment on function public.create_organisation(
  text, text, text, text, text, text, text, text, text, text, text, text, integer, integer
) is
  'Creates an organisation, its first branch and the caller as owner, in one transaction. The only self-serve path onto organisations/profiles — see migration comment.';

revoke execute on function public.create_organisation(
  text, text, text, text, text, text, text, text, text, text, text, text, integer, integer
) from public;
grant execute on function public.create_organisation(
  text, text, text, text, text, text, text, text, text, text, text, text, integer, integer
) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- org_invites: an owner's intent to add a teammate, before that teammate has
-- an auth account at all.
--
-- No UPDATE/DELETE policy for any client role, same shape as
-- consignment_events (migration 06): readable by the org, but the only writer
-- of accepted_at is accept_org_invite() below. An owner could otherwise mark
-- their own invite accepted without the invitee ever signing in.
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.org_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organisations(id) on delete cascade,
  email       text not null,
  role        text not null
              constraint org_invites_role_chk
              check (role in ('dispatcher', 'accounts', 'viewer')),
  invited_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz
);

create index if not exists org_invites_org_idx on public.org_invites (org_id);

-- One case-insensitive lookup path: accept_org_invite() finds the invite by
-- the signed-in user's own email. Without lower(email) two invites differing
-- only in case would both look pending forever.
create index if not exists org_invites_email_idx on public.org_invites (lower(email));

comment on table public.org_invites is
  'A pending seat for someone who does not have an auth account yet. Consumed exactly once by accept_org_invite().';

alter table public.org_invites enable row level security;

drop policy if exists "org_invites_select" on public.org_invites;
create policy "org_invites_select" on public.org_invites
  for select to authenticated
  using (org_id = (select public.current_org_id()));

drop policy if exists "org_invites_insert" on public.org_invites;
create policy "org_invites_insert" on public.org_invites
  for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role('owner')));

-- No UPDATE, no DELETE: acceptance goes through accept_org_invite() only.

revoke all on public.org_invites from anon;
grant select, insert on public.org_invites to authenticated;

-- Migration 12 granted service_role access to every table that existed at
-- that point via a one-time `grant ... on all tables in schema public`
-- snapshot — Postgres does not extend that to tables created afterwards.
-- org_invites is the first new table since, so it needs its own explicit
-- grant or a future admin script touching it hits a silent permission-denied
-- (exactly the class of migration-ordering trap CLAUDE.md warns about).
grant all privileges on public.org_invites to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- accept_org_invite: claim the caller's own pending invite, if one exists.
--
-- Takes no arguments on purpose — it acts on auth.uid()'s own email, never an
-- id or token supplied by the client, so there is nothing here for one user
-- to hand to or guess for another.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.accept_org_invite()
returns table (org_id uuid, role text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_invite record;
begin
  if v_uid is null then
    raise exception 'accept_org_invite: no authenticated user' using errcode = '28000';
  end if;

  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'accept_org_invite: this account already belongs to an organisation'
      using errcode = '23505';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;

  select i.* into v_invite
    from public.org_invites i
   where lower(i.email) = lower(v_email)
     and i.accepted_at is null
     and i.expires_at > now()
   order by i.created_at desc
   limit 1;

  if v_invite.id is null then
    return;  -- No pending invite. Caller falls back to self-serve onboarding.
  end if;

  insert into public.profiles (id, org_id, full_name, role)
  values (
    v_uid,
    v_invite.org_id,
    (select raw_user_meta_data ->> 'full_name' from auth.users where id = v_uid),
    v_invite.role
  );

  update public.org_invites set accepted_at = now() where id = v_invite.id;

  return query select v_invite.org_id, v_invite.role;
end;
$$;

comment on function public.accept_org_invite() is
  'Claims the caller''s own pending invite by email, if any, and creates their profile. Returns no rows when there is nothing to accept.';

revoke execute on function public.accept_org_invite() from public;
grant execute on function public.accept_org_invite() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- seed_document_sequence: continue a paper LR/invoice book onto a branch
-- added after the organisation already exists (create_organisation does the
-- same seeding inline for an org's first branch — this is that same idea for
-- its second, third, ...).
--
-- document_sequences is deny-all under RLS (migration 04): no authenticated
-- session may write it directly. Rather than reach for the service role for
-- this (which CLAUDE.md reserves for exactly three unrelated things — POD
-- upload, signed URLs, the PDF cache), this is its own narrow
-- SECURITY DEFINER whose only privilege is seeding a counter's starting
-- value, gated on the caller owning the branch's organisation.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.seed_document_sequence(
  p_branch_id       uuid,
  p_doc_type        text,
  p_fy              text,
  p_starting_number integer
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not (select public.has_role('owner')) then
    raise exception 'seed_document_sequence: requires the owner role' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.branches b
     where b.id = p_branch_id and b.org_id = (select public.current_org_id())
  ) then
    raise exception 'seed_document_sequence: branch % not found in your organisation', p_branch_id
      using errcode = 'P0002';
  end if;
  if p_doc_type not in ('LR', 'INV') then
    raise exception 'seed_document_sequence: unknown doc_type %', p_doc_type using errcode = '22023';
  end if;
  if p_starting_number <= 0 or p_starting_number > 999999 then
    raise exception 'seed_document_sequence: starting number out of range' using errcode = '22003';
  end if;

  insert into public.document_sequences (branch_id, doc_type, fy, last_value)
  values (p_branch_id, p_doc_type, p_fy, p_starting_number)
  on conflict (branch_id, doc_type, fy) do nothing;
end;
$$;

comment on function public.seed_document_sequence(uuid, text, text, integer) is
  'Owner-only: sets a branch''s starting document number, for a transporter continuing a paper book. No-op if the counter already has a value.';

revoke execute on function public.seed_document_sequence(uuid, text, text, integer) from public;
grant execute on function public.seed_document_sequence(uuid, text, text, integer) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- branch_has_issued_documents: has this branch ever had a number allocated.
--
-- document_sequences is deny-all under RLS (migration 04), so a plain SELECT
-- through the user-scoped client silently returns zero rows regardless of the
-- truth — not "no documents issued", just "not permitted to look". Settings'
-- branch-prefix-lock guardrail needs a real answer, not that false negative,
-- hence a narrow SECURITY DEFINER that returns a boolean only, never the
-- counters themselves.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.branch_has_issued_documents(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.document_sequences ds
    join public.branches b on b.id = ds.branch_id
    where ds.branch_id = p_branch_id
      and b.org_id = (select public.current_org_id())
  )
$$;

comment on function public.branch_has_issued_documents(uuid) is
  'True once next_doc_number() or seed_document_sequence() has ever run for this branch. Drives the Settings prefix-lock guardrail.';

revoke execute on function public.branch_has_issued_documents(uuid) from public;
grant execute on function public.branch_has_issued_documents(uuid) to authenticated;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop function if exists public.branch_has_issued_documents(uuid);
-- drop function if exists public.seed_document_sequence(uuid, text, text, integer);
-- drop function if exists public.accept_org_invite();
-- drop table if exists public.org_invites;
-- drop function if exists public.create_organisation(text, text, text, text, text, text, text, text, text, text, text, text, integer, integer);
