# LogiFlow — build status

**As of 7 September 2026** · branch `feat/masters-crud-and-realtime` · [github.com/mehtab-afsar/logflow](https://github.com/mehtab-afsar/logflow)

Dispatch, lorry receipt and proof-of-delivery platform for Indian FTL transporters.

```bash
npx supabase start     # Docker must be running
npm run db:reset       # migrations + starter data; prints the links
npm run dev            # → http://localhost:3000/dashboard  (no sign-in)
```

---

## At a glance

| | |
|---|---|
| Status | Working MVP. Full PRD §5 scope, running locally. |
| Not done | Deployment, real authentication. Both need credentials from you. |
| Tests | 429 unit · 40 end-to-end · passing twice consecutively without a reseed |
| Checks | `typecheck`, `lint`, production build — all clean |
| Database | 15 tables · 19 functions · 32 RLS policies · 55 indexes · 13 migrations |
| Code | ~2,250 lines SQL · ~8,800 lines TS/TSX · ~5,000 lines of tests |

---

## What works end to end

Create an LR → dispatch (mints a driver link, records the advance) → the driver taps through milestones on his phone → photographs the POD → the office verifies it → one click raises the bill → PDF and Tally CSV.

Four surfaces, all functional:

| Surface | Route | Notes |
|---|---|---|
| Office app | `/dashboard` and below | Today board, register, LR create + detail, fleet, parties, settings, billing |
| Driver portal | `/d/[token]` | No login. Milestones, POD capture, expenses, offline queue, English/Hindi/Kannada |
| Public tracking | `/track/[token]` | Server-rendered; works with JavaScript disabled |
| Landing | `/` | Plus an onboarding wizard at `/start` from a parallel session |

---

## The decisions that matter

These are the choices that would be expensive to reverse later, and the reasoning behind them.

### Gapless numbering is a table, not a sequence

A Postgres sequence is deliberately non-transactional: a rolled-back insert permanently burns a number. An LR book with a missing serial is a compliance problem — a transporter must be able to produce every number issued. So the counter is a row, updated inside the caller's transaction, which rolls back with it.

**Proven:** 20 concurrent allocations produce 20 distinct gapless numbers; a rolled-back transaction reuses its number; 1 April rolls to a new financial year and restarts at 1; back-dating into the previous year correctly continues the *old* sequence.

The cost is that LR creation serialises per branch. At ~80 a day that is invisible. Do not "optimise" it into a sequence.

### A status cannot change without an audit event

Both the status update and the event row are written inside one security-definer function, in one transaction. `consignment_events` has RLS enabled and **no write policy for any client role** — the only writer is that function. There is no code path, including a bug, that moves a consignment without leaving a trail.

### The anonymous surface is four functions and zero tables

The obvious approach — an RLS policy allowing `SELECT` where the tracking token matches — exposes every column to anyone with the link, including freight and both parties' GSTINs. A consignee forwarded a tracking link would see what the consignor is paying.

Instead there is no anon-readable table anywhere. `track_consignment()` returns a hand-written whitelist of ten keys. A repo guard fails the build if that set changes or if any money/identity word appears in the function body.

### Tax is computed once, then frozen

CGST/SGST/IGST depend on the organisation's mode and state — a cross-row lookup, which a generated column cannot do. They are written by one pure tested function and stored, alongside a `tax_snapshot` recording the inputs. A historical LR therefore reprints identically after the organisation changes its tax mode.

### Money never touches a float

PostgREST serialises `numeric` to a JSON number, which JavaScript parses as a float. `0.1 + 0.2` becomes a ₹0.01 invoice discrepancy that an accountant will find. All arithmetic is in integer paise inside `lib/money.ts`, and `computeTax` takes `taxableValuePaise` so the rule cannot be bypassed by accident.

---

## Verified, not assumed

Each of these was executed and observed, not reasoned about.

| Claim | How it was proven |
|---|---|
| Numbering is gapless under concurrency | 20 parallel allocations → 20 distinct, no gaps |
| A rollback does not burn a number | `BEGIN; …; ROLLBACK;` then re-allocate — same number returned |
| Financial year rolls over correctly | TS and SQL agree on **all 2,192 dates** across six years |
| Tracking leaks nothing | JS-disabled browser; asserted against field names, the actual freight value, GSTIN and phone patterns |
| Driver shows as first name only | Surname asserted absent from rendered text |
| Cross-tenant access is invisible | Second org created; gets **404, not 403**, on reads, transitions and PDFs |
| A replayed POD upload does not duplicate | Same `client_id` posted twice → one row, `deduped: true` |
| The offline queue survives no signal | Aeroplane mode, two milestones, radio back on, queue drains |
| The board moves by itself | Driver milestone posted from a separate session; card moves with **no `page.reload()`** |
| The dev auth bypass cannot reach production | Built for production with the flag still set — refused, redirected |
| Migrations are idempotent | Applied twice; three violations injected to confirm the guard actually fails |

---

## Repo guards

Tests that read the source and fail the build on a class of mistake, rather than a specific one.

| Guard | Prevents |
|---|---|
| `rls-policies` | A table reachable without RLS; a policy not scoped to the caller's org |
| `anon-grants` | A fifth anonymous grant appearing without a deliberate edit |
| `tracking-projection` | A money or identity field entering the public projection |
| `migration-idempotency` | A migration that cannot be re-run — including `ADD CONSTRAINT` without a guard |
| `security-definer-hygiene` | A definer function without `search_path = ''` or its revoke |
| `state-machine-parity` | The SQL and TypeScript state machines drifting apart |
| `dev-auth-guard` | The local login bypass losing its production guard |
| `design-tokens` | Status shown as colour alone; stray hex outside the token file |

---

## Test inventory

**Unit — 429 across 16 files**

`rls-policies` 80 · `tax` 49 (the full 3 modes × intra/inter × exempt matrix) · `migration-idempotency` 53 · `india-validators` 37 (incl. GSTIN mod-36 checksum) · `security-definer-hygiene` 35 · `tracking-projection` 32 · `design-tokens` 27 · `state-machine-parity` 20 · `money` 18 · `eway-bill` 17 · `driver-queue` 16 · `dev-auth-guard` 14 · `fy` 13 · `tally-csv` 7 · `anon-grants` 6 · `rate-limit` 5

**End-to-end — 40 across 8 files, three device profiles**

`masters` 9 · `driver-portal` 7 (mobile) · `smoke` 6 · `billing` 5 · `tracking-nojs` 5 (JavaScript disabled) · `lr-lifecycle` 4 · `rls-cross-tenant` 2 · `realtime` 2

Tests provision their own data rather than consuming the seed, so the suite is repeatable and survived shrinking the seed from 40 lorry receipts to 2 without a single change.

---

## Bugs found and fixed during the build

Worth recording because most were caught by tooling rather than by looking.

| Found | Was |
|---|---|
| `FOR UPDATE` with an aggregate | `create_bill` failed at call time — Postgres forbids it. Now locks in a subquery and counts outside |
| Branch prefixes could collide | Invoice numbers are sequenced per branch but unique per org; two branches sharing `INV` minted duplicates. Now enforced by a unique index |
| `authenticated` had no table grants | RLS filters rows, but a GRANT permits the verb. Both are needed; the schema no longer depends on a project setting |
| Driver routes ran as service role | PostgREST reports a missing grant as SQLSTATE 42501 — the same code the RPCs raise for "link expired" — so a permission bug masqueraded as an expired link. They now use the anon key |
| POD images were broken | The seed wrote a storage path but never uploaded a file |
| Dashboard showed "just now" for everything | It displayed `updated_at`, a row-write timestamp, not the last real event |
| `/apple-touch-icon.png` 404'd | iOS requests it automatically — exactly what a driver's phone hits |
| `robots.txt` redirected to login | A crawler would read the whole site as an auth wall |
| Party form collected no address | Any party added through the UI failed with "origin city is required" on an LR |
| Untouched selects posted `""` | A Zod enum rejects the empty string rather than applying its default |
| Test suite consumed its own seed | Passed once, then starved. Now repeatable three runs deep |

Two designs of my own that I rejected after writing them: a generic CRUD factory over the three master tables (it forced a cast to `any`, the exact untyped-client mistake this codebase exists to avoid), and a form that reset itself in an effect (restructured to remove the state instead of suppressing the lint rule).

---

## What is left

### Blocking a pilot

1. **Deployment.** Local only. Needs a Vercel project and a hosted Supabase project — I cannot create either without credentials. The demo must run on a URL the client opens on their own phone; localhost kills the driver-link moment.
2. **Real authentication.** The login screen is removed and a triple-gated dev bypass signs pages in. Needs a decision first: magic link requires SMTP, phone OTP requires a paid SMS provider.

### Rough edges that show on screen

3. Party field is a native dropdown, not the type-three-letters combobox. The search API exists; the UI does not use it. This is the "under 60 seconds" claim.
4. Native `<select>` elements on the LR form do not match the shadcn inputs.
5. Register has no date/party filters or CSV export — status filter and paging work.
6. Settlement PDF not built. The settlement view works.

### Brand and visual pass

7. One token system across all four surfaces; a mark on the LR, bill, tracking page and driver portal; the printed LR matched to the landing page's hero LR.
8. Optimistic updates everywhere, skeletons shaped like the final layout, autosave drafts, keyboard shortcuts.

### Phase 2, by demand

NIC e-way bill API · WhatsApp Business API · GPS/FASTag · Tally sync beyond CSV · PTL/LTL consolidation · customer portal with login.

---

## Two constraints to accept

**PDFs are English only.** `@react-pdf` has no HarfBuzz, so it performs no complex-script shaping — Devanagari conjuncts and Kannada render as broken or blank glyphs. Indian LRs are English in practice and checkposts expect it. Hindi and Kannada matter on the driver's screen, which is where they are. If a regional-language LR is ever required, render HTML through headless Chromium instead.

**The rate limiter is per-process.** In-memory, deliberately: adding Redis to a single-instance pilot is cost without benefit. It **must** move to a shared store before running more than one instance, or each instance allows the full quota independently.

---

## Parallel work

A second session added `app/start/` (onboarding wizard), `features/onboarding/` and `features/marketing/`, and edited `proxy.ts`. All of it is committed and untouched by me. I overwrote `lib/india/states.ts` once by accident and restored their version — theirs documents why GST codes 25 and 28 are deliberately absent, which mine did not.

Each session should work on its own branch and merge daily.

---

## Where things live

```
app/            routes. (app)/ is the authed shell; d/ and track/ are token-scoped
features/       UI by domain — consignments, driver, tracking, billing, masters,
                dashboard, onboarding, marketing, shell
lib/            business logic. tax.ts, money.ts, india/, consignments/, pdf/
supabase/       13 numbered, idempotent migrations + starter seed
__tests__/      unit and repo guards (node), driver-queue (jsdom)
e2e/            playwright: chromium, mobile (driver), nojs (tracking)
```

`CLAUDE.md` carries the prime directives and the traps that will bite — `search_path = ''` failing at call time rather than create time, `ADD CONSTRAINT` having no `IF NOT EXISTS`, and why `/track/[token]` must never gain a `'use client'`.

**Before pushing:** `npm run typecheck && npm run lint && npm test && npm run test:e2e`
