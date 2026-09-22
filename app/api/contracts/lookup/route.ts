import { type NextRequest } from "next/server";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const querySchema = z.object({
  counterparty_type: z.enum(["consignor", "vendor"]),
  party_id: z.string().uuid(),
  origin_city: z.string().optional(),
  destination_city: z.string().optional(),
  vehicle_type: z.string().optional(),
});

/**
 * Thin wrapper around lookup_rate_contract() — a suggestion for the LR form
 * (consignor rate) and vendor settlement UI (payable rate) to prefill,
 * never applied automatically.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return apiErr("Invalid lookup parameters", 422);
  const q = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lookup_rate_contract", {
    p_counterparty_type: q.counterparty_type,
    p_party_id: q.party_id,
    p_origin_city: q.origin_city,
    p_destination_city: q.destination_city,
    p_vehicle_type: q.vehicle_type,
  });

  if (error) {
    log.error("GET /api/contracts/lookup", { err: error.message });
    return apiErr("Could not look up a contract rate", 500);
  }
  return apiOk(data);
}
