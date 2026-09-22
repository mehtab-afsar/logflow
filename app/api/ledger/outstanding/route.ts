import { type NextRequest } from "next/server";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const querySchema = z.object({
  party_id: z.string().uuid(),
});

/** Thin wrapper around party_outstanding() — live-computed, never stored. */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return apiErr("Invalid lookup parameters", 422);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("party_outstanding", {
    p_party_id: parsed.data.party_id,
  });

  if (error) {
    log.error("GET /api/ledger/outstanding", { err: error.message });
    return apiErr("Could not load this party's outstanding balance", 500);
  }
  return apiOk(data);
}
