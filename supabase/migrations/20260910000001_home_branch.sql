-- ═══════════════════════════════════════════════════════════════════════════
-- 15 · Home branch
--
-- Without this, New LR defaults branch_id to the first row an alphabetical
-- ORDER BY name returns (see LrForm.tsx). One branch, that is invisible. The
-- moment an organisation adds a second — say "Bengaluru" alongside "Head
-- office" — B outranks H and every new LR silently defaults to the wrong
-- branch: wrong prefix, and a number burned in the wrong gapless sequence.
-- That cannot be undone quietly, unlike most settings mistakes.
--
-- Nullable, not required: existing single-branch organisations, and anyone
-- who has not set one yet, must keep working exactly as before — the app
-- falls back to branches[0] when it is null.
--
-- No new RLS policy: "profiles_update" (migration 02) already allows
-- `id = auth.uid()`, i.e. anyone editing their own profile row, which is
-- exactly the shape of "set my own home branch".
--
-- No cross-org CHECK constraint: PostgreSQL forbids a subquery inside a CHECK,
-- so "this branch belongs to my organisation" cannot be enforced there. It
-- does not need a trigger either — app/api/profiles/home-branch/route.ts reads
-- the target branch back through the user-scoped client, and RLS already
-- hides another tenant's branch id from that read (a cross-tenant id looks
-- exactly like a wrong one: 404, never 403 — CLAUDE.md's second directive).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists home_branch_id uuid references public.branches(id) on delete set null;

comment on column public.profiles.home_branch_id is
  'Defaults New LR''s branch picker. Null falls back to branches[0] client-side.';

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- alter table public.profiles drop column if exists home_branch_id;
