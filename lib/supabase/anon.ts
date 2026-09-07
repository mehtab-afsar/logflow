import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { env } from "@/lib/env";

/**
 * Server-side client holding ONLY anonymous privileges — no cookies, no
 * session, no service role.
 *
 * The driver-portal routes use this deliberately. A driver has no account; the
 * token in the URL is the entire credential, and the RPCs behind it are the
 * four functions granted to `anon`. Running those calls with the service role
 * would work, but it would mean the routes could silently reach anything, and
 * a mistake in the RPC's own authorisation would stop being caught.
 *
 * It also keeps the failure modes honest: PostgREST reports a missing function
 * grant as SQLSTATE 42501 — the same code our RPCs raise for "this link has
 * expired" — so running with elevated privileges would mask a real permission
 * bug as an expired link.
 */
export function createAnonClient() {
  return createSupabaseClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
