import { type NextRequest } from "next/server";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const schema = z.object({
  vendor_party_id: z.string().uuid(),
  consignment_id: z.string().uuid(),
  amount: z.number().positive(),
  notes: z.string().max(500).optional(),
});

/**
 * Accrues what's owed to a vendor for one trip — record_vendor_charge()
 * verifies the vendor actually owns the attached vehicle on that consignment,
 * so a mismatch is a 404 (not found), not a 403: the same tenancy-shaped
 * "don't confirm what exists" reasoning as everywhere else in this app.
 *
 * The amount is typed from the vendor's own invoice, not computed from
 * lookup_rate_contract() — that RPC is a suggestion for the UI to prefill,
 * never applied automatically.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);
  if (!["owner", "accounts"].includes(auth.ctx.role)) {
    return apiErr("Recording a vendor charge requires the owner or accounts role", 403);
  }

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return apiErr(parsed.error, 400);
  const input = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_vendor_charge", {
    p_party_id: input.vendor_party_id,
    p_consignment_id: input.consignment_id,
    p_amount: input.amount,
    p_notes: input.notes ?? undefined,
  });

  if (error) {
    const status =
      error.code === "42501" ? 403 : error.code === "23514" ? 409 : error.code === "P0002" ? 404 : 500;
    if (status === 500) log.error("record_vendor_charge failed", { err: error.message });
    return apiErr(error.message, status);
  }

  return apiOk(data, 201);
}
