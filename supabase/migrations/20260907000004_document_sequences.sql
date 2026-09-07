-- ═══════════════════════════════════════════════════════════════════════════
-- 04 · Gapless document numbering, per branch, per financial year
--
-- WHY A TABLE AND NOT A SEQUENCE: Postgres sequences are explicitly
-- non-transactional — they do not roll back, so a failed insert permanently
-- burns a number. An LR book with a missing serial is a compliance problem: a
-- transporter must be able to produce every number issued. A counter row,
-- updated inside the caller's transaction, rolls back with it and is therefore
-- genuinely gapless.
--
-- WHY NOT `SELECT ... FOR UPDATE` ON branches (as first drafted): branches has
-- no financial-year dimension, so FY rollover has nowhere to live; locking the
-- branch row would block unrelated branch edits; and the invoice sequence needs
-- its own independent counter on the same branch.
--
-- TRADE-OFF, STATED DELIBERATELY: document creation serialises per branch per
-- doc type. At roughly 80 LRs a day that is invisible. Do not "optimise" this
-- into a sequence — that silently reintroduces gaps and breaks the statutory
-- guarantee this table exists to provide.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.document_sequences (
  branch_id  uuid not null references public.branches(id) on delete cascade,
  doc_type   text not null
             constraint document_sequences_type_chk check (doc_type in ('LR', 'INV')),
  fy         text not null
             constraint document_sequences_fy_chk check (fy ~ '^[0-9]{4}$'),
  last_value bigint not null default 0
             constraint document_sequences_value_chk check (last_value >= 0),
  updated_at timestamptz not null default now(),
  primary key (branch_id, doc_type, fy)
);

comment on table public.document_sequences is
  'Transactional counters for LR and invoice numbers. One row per branch per doc type per financial year. Never reset, never rewound.';

-- Deny-all: RLS on, zero policies. Only SECURITY DEFINER functions and the
-- service role may touch this. A client that could increment the counter
-- directly could burn numbers or forge them.
alter table public.document_sequences enable row level security;
revoke all on public.document_sequences from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- next_doc_number: allocate the next number for a branch/type/FY.
--
-- The `insert ... on conflict do update ... returning` takes an exclusive row
-- lock on the counter for the remainder of the transaction, so concurrent
-- callers serialise cleanly.
--
-- NOTE the `as ds` alias on the insert target. Under `search_path = ''` a
-- self-reference in the DO UPDATE clause cannot be schema-qualified, so
-- `do update set last_value = public.document_sequences.last_value + 1` is a
-- syntax error. Aliasing is the only way to write this.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.next_doc_number(
  p_branch_id uuid,
  p_doc_type  text,
  p_date      date
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_fy     text;
  v_seq    bigint;
  v_prefix text;
begin
  if p_doc_type not in ('LR', 'INV') then
    raise exception 'next_doc_number: unknown doc_type %', p_doc_type using errcode = '22023';
  end if;

  v_fy := public.fy_code(p_date);

  select case p_doc_type when 'LR' then b.lr_prefix when 'INV' then b.inv_prefix end
    into v_prefix
    from public.branches b
   where b.id = p_branch_id;

  if v_prefix is null then
    raise exception 'next_doc_number: branch % not found', p_branch_id using errcode = 'P0002';
  end if;

  insert into public.document_sequences as ds (branch_id, doc_type, fy, last_value)
  values (p_branch_id, p_doc_type, v_fy, 1)
  on conflict (branch_id, doc_type, fy)
  do update set last_value = ds.last_value + 1,
                updated_at = now()
  returning ds.last_value into v_seq;

  if v_seq > 999999 then
    raise exception 'next_doc_number: sequence exhausted for % % %', p_branch_id, p_doc_type, v_fy
      using errcode = '22003';
  end if;

  -- LF-2627-000412
  return v_prefix || '-' || v_fy || '-' || lpad(v_seq::text, 6, '0');
end;
$$;

comment on function public.next_doc_number(uuid, text, date) is
  'Allocates the next gapless document number. Transactional: rolls back with the caller, so no number is ever burned.';

revoke execute on function public.next_doc_number(uuid, text, date) from public;
grant  execute on function public.next_doc_number(uuid, text, date) to authenticated;

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- drop function if exists public.next_doc_number(uuid, text, date);
-- drop table if exists public.document_sequences;
