-- ═══════════════════════════════════════════════════════════════════════════
-- Blank LR reservations — the physical-LR problem.
--
-- WHY: gapless numbering (migration 04) exists so a transporter can produce
-- every LR number ever issued. That guarantee was built assuming the number
-- is minted at the moment the LR is created digitally. It is not always —
-- some pickups happen where nobody can print or even open a link (confirmed
-- directly: a driver with no smartphone, and nobody at the pickup point
-- reliably able to print either). The paper-first reality there is a
-- pre-printed, pre-numbered blank form, filled by hand, reconciled into the
-- app later.
--
-- This table makes that reality first-class rather than a workaround: a
-- number is reserved from the SAME counter `next_doc_number()` already uses,
-- a blank form is printed against it, and it is later completed into a real
-- `consignments` row — or, if the paper is spoiled or lost, permanently
-- voided. Either way the number is accounted for. A reservation is never
-- deleted and its number is never reused once printed — unlike a rolled-back
-- `consignments` insert (genuinely transactional, per migration 04's own
-- header comment), paper with that number on it may already exist in the
-- world by the time anyone finds out it will not be used.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.lr_blank_reservations (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organisations(id) on delete cascade,
  branch_id                 uuid not null references public.branches(id) on delete restrict,
  lr_no                     text not null,
  fy                        text not null
                            constraint lr_blank_reservations_fy_chk check (fy ~ '^[0-9]{4}$'),
  reserved_date             date not null default current_date,
  batch_id                  uuid not null,
  status                    text not null default 'reserved'
                            constraint lr_blank_reservations_status_chk
                            check (status in ('reserved', 'claimed', 'reconciled', 'void')),
  reserved_by               uuid references public.profiles(id) on delete set null,
  reserved_at               timestamptz not null default now(),
  claimed_by                uuid references public.profiles(id) on delete set null,
  claimed_at                timestamptz,
  reconciled_consignment_id uuid references public.consignments(id) on delete set null,
  reconciled_by             uuid references public.profiles(id) on delete set null,
  reconciled_at             timestamptz,
  voided_by                 uuid references public.profiles(id) on delete set null,
  voided_at                 timestamptz,
  void_reason               text,
  constraint lr_blank_reservations_void_reason_chk
    check (status <> 'void' or (void_reason is not null and btrim(void_reason) <> ''))
);

comment on table public.lr_blank_reservations is
  'Pre-printed blank LR numbers, reserved ahead of the digital record for a driver with no way to receive one at pickup. Voided, never deleted or reused once printed.';

-- The number can only ever be minted once: both this table and a normal
-- consignments insert draw exclusively from next_doc_number(), which locks
-- one counter row per branch/doc_type/FY — whichever caller runs first wins,
-- so no cross-table uniqueness constraint against consignments.lr_no is
-- needed to prevent a collision.
create unique index if not exists lr_blank_reservations_org_lrno_uniq
  on public.lr_blank_reservations (org_id, lr_no);
create index if not exists lr_blank_reservations_batch_idx
  on public.lr_blank_reservations (batch_id);
create index if not exists lr_blank_reservations_open_idx
  on public.lr_blank_reservations (org_id, branch_id) where status in ('reserved', 'claimed');

alter table public.lr_blank_reservations enable row level security;

-- Read-only for every client role, same treatment as consignment_events: all
-- writes go through the SECURITY DEFINER functions below, which is what
-- keeps "reserved → claimed → reconciled/void" an honest state machine
-- instead of something a client could jump straight past.
drop policy if exists "lr_blank_reservations_select" on public.lr_blank_reservations;
create policy "lr_blank_reservations_select" on public.lr_blank_reservations
  for select to authenticated using (org_id = (select public.current_org_id()));

revoke all           on public.lr_blank_reservations from anon;
revoke insert, update, delete on public.lr_blank_reservations from authenticated;
grant  select on public.lr_blank_reservations to authenticated;

-- Migration 12's `grant ... on all tables` was a one-time snapshot at the
-- point it ran — Postgres does not extend it to tables created afterwards.
-- Without this, an admin-client script (e.g. a future seed/import tool)
-- touching this table hits a silent permission-denied, the exact
-- migration-ordering trap CLAUDE.md warns about.
grant all privileges on public.lr_blank_reservations to service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- A reconciled LR's permanent provenance marker — queryable, not just
-- implied by the reservation row pointing back at it.
-- ───────────────────────────────────────────────────────────────────────────
alter table public.consignments
  add column if not exists blank_reservation_id uuid references public.lr_blank_reservations(id) on delete set null;

create unique index if not exists consignments_blank_reservation_uniq
  on public.consignments (blank_reservation_id) where blank_reservation_id is not null;

comment on column public.consignments.blank_reservation_id is
  'Set when this LR started life as a hand-filled paper form. See lr_blank_reservations.';

-- ───────────────────────────────────────────────────────────────────────────
-- Harden assign_lr_number(): today a caller-supplied non-blank lr_no is
-- accepted with no validation at all — harmless only because nothing sets
-- one. Reservations are the first legitimate reason a non-blank lr_no should
-- ever reach this trigger, so the gap they open is closed in the same
-- migration that starts using it: a pre-set number is now only accepted when
-- it matches a reservation this exact insert is completing.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.assign_lr_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lr_no is null or btrim(new.lr_no) = '' then
    new.lr_no := public.next_doc_number(new.branch_id, 'LR', new.lr_date);
  else
    if new.blank_reservation_id is null or not exists (
      select 1 from public.lr_blank_reservations r
       where r.id = new.blank_reservation_id
         and r.org_id = new.org_id
         and r.lr_no = new.lr_no
         and r.status = 'claimed'
    ) then
      raise exception 'lr_no may only be pre-set by completing a claimed blank-form reservation'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.assign_lr_number() from public;

-- ═══════════════════════════════════════════════════════════════════════════
-- RPCs. All authenticated-only, none reach anon — this whole feature is an
-- office operation; the driver has no smartphone to call any of it from.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- reserve_blank_lr_numbers: mint and reserve a batch of blank LR numbers for
-- a branch, ready to print. Reuses next_doc_number() — the same counter, the
-- same lock, so a reservation and a normal LR creation can never collide.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.reserve_blank_lr_numbers(
  p_branch_id     uuid,
  p_count         int,
  p_reserved_date date default current_date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org   uuid := public.current_org_id();
  v_batch uuid := gen_random_uuid();
  v_fy    text := public.fy_code(p_reserved_date);
  v_no    text;
  v_out   jsonb := '[]'::jsonb;
begin
  if v_org is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.has_role('owner', 'dispatcher') then
    raise exception 'reserving blank forms requires the owner or dispatcher role' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 50 then
    raise exception 'reserve between 1 and 50 forms at a time' using errcode = '23514';
  end if;
  if not exists (select 1 from public.branches b where b.id = p_branch_id and b.org_id = v_org) then
    -- "not found", not "forbidden" — same reasoning as transition_consignment.
    raise exception 'branch not found' using errcode = 'P0002';
  end if;

  for _ in 1..p_count loop
    v_no := public.next_doc_number(p_branch_id, 'LR', p_reserved_date);

    insert into public.lr_blank_reservations
      (org_id, branch_id, lr_no, fy, reserved_date, batch_id, reserved_by)
    values
      (v_org, p_branch_id, v_no, v_fy, p_reserved_date, v_batch, (select auth.uid()));

    v_out := v_out || jsonb_build_object('lr_no', v_no);
  end loop;

  return jsonb_build_object('batch_id', v_batch, 'reservations', v_out);
end;
$$;

revoke execute on function public.reserve_blank_lr_numbers(uuid, int, date) from public;
grant  execute on function public.reserve_blank_lr_numbers(uuid, int, date) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- claim_blank_lr_reservation: idempotent — re-claiming an already-claimed
-- reservation is not an error, so a colleague can pick up a form after a
-- failed create-form submission without needing a separate "release" action.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.claim_blank_lr_reservation(p_reservation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.current_org_id();
  v_row public.lr_blank_reservations;
begin
  if v_org is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.has_role('owner', 'dispatcher') then
    raise exception 'this action requires the owner or dispatcher role' using errcode = '42501';
  end if;

  select * into v_row from public.lr_blank_reservations
   where id = p_reservation_id and org_id = v_org
   for update;

  if v_row.id is null then
    raise exception 'reservation not found' using errcode = 'P0002';
  end if;
  if v_row.status not in ('reserved', 'claimed') then
    raise exception 'this form is already % and cannot be claimed', v_row.status using errcode = '23514';
  end if;

  if v_row.status = 'reserved' then
    update public.lr_blank_reservations
       set status = 'claimed', claimed_by = (select auth.uid()), claimed_at = now()
     where id = p_reservation_id;
  end if;

  return jsonb_build_object(
    'id', v_row.id, 'lr_no', v_row.lr_no, 'branch_id', v_row.branch_id, 'reserved_date', v_row.reserved_date
  );
end;
$$;

revoke execute on function public.claim_blank_lr_reservation(uuid) from public;
grant  execute on function public.claim_blank_lr_reservation(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- complete_blank_lr_reservation: called right after the consignments insert
-- that used this reservation's number succeeds — see assign_lr_number()
-- above, which is what actually enforces that the number could only have
-- been used this way in the first place.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.complete_blank_lr_reservation(
  p_reservation_id uuid,
  p_consignment_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.current_org_id();
  v_row public.lr_blank_reservations;
begin
  if v_org is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.lr_blank_reservations
   where id = p_reservation_id and org_id = v_org
   for update;

  if v_row.id is null then
    raise exception 'reservation not found' using errcode = 'P0002';
  end if;
  if v_row.status <> 'claimed' then
    raise exception 'this form is % and cannot be reconciled', v_row.status using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.consignments c
     where c.id = p_consignment_id and c.org_id = v_org
       and c.lr_no = v_row.lr_no and c.blank_reservation_id = p_reservation_id
  ) then
    raise exception 'that consignment does not match this reservation' using errcode = '23514';
  end if;

  update public.lr_blank_reservations
     set status = 'reconciled', reconciled_consignment_id = p_consignment_id,
         reconciled_by = (select auth.uid()), reconciled_at = now()
   where id = p_reservation_id;

  return jsonb_build_object('id', p_reservation_id, 'status', 'reconciled');
end;
$$;

revoke execute on function public.complete_blank_lr_reservation(uuid, uuid) from public;
grant  execute on function public.complete_blank_lr_reservation(uuid, uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- void_blank_lr_reservation: permanent. A reconciled reservation is a real
-- LR now and is cancelled through transition_consignment(..., 'cancelled',
-- ...) instead — never through here.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.void_blank_lr_reservation(
  p_reservation_id uuid,
  p_reason         text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := public.current_org_id();
  v_row public.lr_blank_reservations;
begin
  if v_org is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not public.has_role('owner', 'dispatcher') then
    raise exception 'this action requires the owner or dispatcher role' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'a reason is required to void a reserved LR number' using errcode = '23514';
  end if;

  select * into v_row from public.lr_blank_reservations
   where id = p_reservation_id and org_id = v_org
   for update;

  if v_row.id is null then
    raise exception 'reservation not found' using errcode = 'P0002';
  end if;
  if v_row.status not in ('reserved', 'claimed') then
    raise exception 'this form is already % and cannot be voided here', v_row.status using errcode = '23514';
  end if;

  update public.lr_blank_reservations
     set status = 'void', void_reason = btrim(p_reason),
         voided_by = (select auth.uid()), voided_at = now()
   where id = p_reservation_id;

  return jsonb_build_object('id', p_reservation_id, 'status', 'void');
end;
$$;

revoke execute on function public.void_blank_lr_reservation(uuid, text) from public;
grant  execute on function public.void_blank_lr_reservation(uuid, text) to authenticated;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop function if exists public.void_blank_lr_reservation(uuid, text);
-- drop function if exists public.complete_blank_lr_reservation(uuid, uuid);
-- drop function if exists public.claim_blank_lr_reservation(uuid);
-- drop function if exists public.reserve_blank_lr_numbers(uuid, int, date);
-- alter table public.consignments drop column if exists blank_reservation_id;
-- drop table if exists public.lr_blank_reservations;
