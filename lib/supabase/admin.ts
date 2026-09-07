import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { env } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * TYPED <Database>, with no untyped escape hatch. supabase-js resolves unknown
 * tables to `never`, and the temptation is to paper over that by returning
 * `any` from a shared singleton — a sibling project did exactly that and it
 * caused a billing incident, then cost 203 call sites to unpick. Do not add an
 * `any` variant here.
 *
 * Use only where the service role is genuinely required:
 *   - POD upload (the caller is a driver token, not a session)
 *   - signing storage URLs (after RLS has already authorised the row read)
 *   - the PDF cache (reads and writes an internal bucket)
 *   - scripts/seed-demo.ts
 * Everything else uses lib/supabase/server.ts so RLS stays the boundary.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
