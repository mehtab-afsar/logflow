"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

/**
 * Browser client. A factory called per-hook, not a module singleton, so a
 * signed-out tab never reuses a stale session object.
 *
 * Typed <Database> — see lib/supabase/admin.ts for why that is non-negotiable.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Cannot use lib/env.ts here: NEXT_PUBLIC_* are inlined at build time and
  // the getters would throw during prerender.
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.",
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}
