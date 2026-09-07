# LogiFlow — engineering notes

Dispatch, lorry receipt and proof-of-delivery platform for Indian FTL transporters.

## Run it

```bash
npx supabase start          # Docker must be running
npm run db:reset            # migrations + demo seed; prints logins and links
npm run dev
```

Then open **http://localhost:3000/dashboard** — there is no sign-in screen yet.

The seed creates two of everything (parties, vehicles, drivers, lorry receipts)
as clearly-labelled samples. Replace them with real records and the sample data
is gone.

To act as a different role while developing:
`/api/dev/session?role=viewer` (dev-only, refused in production).

## Prime directives

1. **RLS is the tenancy boundary.** Route handlers read through `lib/supabase/server.ts`
   (user-scoped). The service role is for exactly three things: POD upload, signing
   storage URLs, and the PDF cache — always *after* the caller has been authorised.
2. **A cross-tenant read is a 404, never a 403.** A 403 confirms the record exists.
3. **`anon` reaches four functions and zero tables.** `track_consignment`,
   `driver_trip`, `driver_milestone`, `driver_add_expense`. Adding a fifth means
   editing `__tests__/anon-grants.test.ts` on purpose.
4. **No arithmetic on money outside `lib/money.ts`.** Integer paise only.
   `computeTax` takes `taxableValuePaise` so the rule cannot be bypassed.
5. **Status never changes without an event.** The only writer is
   `_apply_transition()`; `consignment_events` has no write policy for any client role.
6. **No server actions.** The offline queue needs stable URLs and real HTTP status
   codes, and one mutation idiom means one place for auth and validation.

## Layout

```
app/            routes. (app)/ is the authed shell; d/ and track/ are token-scoped
features/       UI by domain — consignments, driver, tracking, billing, dashboard
lib/            business logic. tax.ts, money.ts, india/, consignments/, pdf/
supabase/       migrations (numbered, idempotent) + seed
__tests__/      unit + repo guards (node), driver-queue (jsdom)
e2e/            playwright: chromium, mobile (driver), nojs (tracking)
```

## Things that will bite

- **`search_path = ''` fails at CALL time, not create time.** A migration applies
  cleanly and the feature explodes later. Schema-qualify everything;
  `gen_random_bytes` is `extensions.`, `gen_random_uuid` is not.
- **`ALTER TABLE ... ADD CONSTRAINT` has no `IF NOT EXISTS`.** Wrap it in a
  `do $$ ... pg_constraint ... $$` block or a re-run aborts the batch.
- **`FOR UPDATE` cannot appear with an aggregate.** Lock in a subquery, count outside.
- **PostgREST reports a missing function grant as SQLSTATE 42501** — the same code
  our RPCs raise for "link expired". Run driver routes with the anon key so a
  permission bug cannot masquerade as an expired link.
- **Branch document prefixes must differ.** Numbers are sequenced per branch but
  unique per org; two branches sharing `INV` would collide. Enforced by an index.
- **`/track/[token]` must render with JavaScript off.** No `'use client'`, no
  `<Suspense>`, no `next/image` in that tree. The `nojs` Playwright project guards it.
- **PDFs are English only.** `@react-pdf` has no HarfBuzz, so Devanagari and Kannada
  render as broken glyphs. i18n lives in the driver web UI.

## Before pushing

```bash
npm run typecheck && npm run lint && npm test && npm run test:e2e
```

The repo guards fail the build on a missing RLS policy, a non-idempotent migration,
a new anon grant, a money field leaking into the tracking projection, or the SQL and
TypeScript state machines drifting apart.
