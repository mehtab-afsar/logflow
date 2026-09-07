-- ═══════════════════════════════════════════════════════════════════════════
-- 10 · Private storage buckets
--
-- WHY BUCKETS ARE CREATED HERE AND NOT IN config.toml: config.toml applies
-- only to a local stack. Creating them in a migration means local and hosted
-- are provably identical.
--
-- SECURITY POSTURE: all three buckets are private and have NO storage.objects
-- policies at all. No policy + public = false means only the service role can
-- read or write, which is exactly what we want: every access goes through a
-- route handler that has already authorised the caller (a session via RLS, or
-- a driver token via resolve_trip_token), and downloads are handed out as
-- 10-minute signed URLs.
--
-- The tempting alternative — a "public" bucket for POD thumbnails, or a
-- path-prefix policy on storage.objects — is how proof-of-delivery images
-- leak. storage.objects policies are a separate and easily mis-specified
-- system from table RLS; this design sidesteps them entirely.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('pods',     'pods',     false, 5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('receipts', 'receipts', false, 5242880,  array['image/jpeg', 'image/png', 'image/webp']),
  ('docs',     'docs',     false, 20971520, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Bucket roles:
--   pods     signed delivery challans photographed by the driver
--   receipts driver expense bills (diesel, toll)
--   docs     generated LR / invoice / settlement PDFs, cached by doc_version
-- (No `comment on table storage.buckets` here: that table is owned by the
--  Supabase storage role, so commenting on it fails for the migration user.)

-- ─── Rollback ──────────────────────────────────────────────────────────────
-- delete from storage.buckets where id in ('pods', 'receipts', 'docs');
