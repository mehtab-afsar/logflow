import { type NextRequest } from "next/server";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const schema = z.object({
  counterparty_type: z.enum(["consignor", "vendor"]),
  party_id: z.string().uuid(),
  ref_type: z.enum(["bill", "trip", "advance", "adjustment"]),
  ref_id: z.string().uuid().optional(),
  amount: z.number().positive(),
  payment_mode: z.enum(["cash", "bank_transfer", "upi", "cheque", "other"]),
  reference_no: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

/**
 * One route for both directions — record_payment() is itself one function
 * for "money received from a consignor" and "money paid to a vendor"; an
 * advance and a full settlement are both just this, no separate concept.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);
  if (!["owner", "accounts"].includes(auth.ctx.role)) {
    return apiErr("Recording a payment requires the owner or accounts role", 403);
  }

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return apiErr(parsed.error, 400);
  const input = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_payment", {
    p_counterparty_type: input.counterparty_type,
    p_party_id: input.party_id,
    p_ref_type: input.ref_type,
    p_ref_id: input.ref_id ?? undefined,
    p_amount: input.amount,
    p_payment_mode: input.payment_mode,
    p_reference_no: input.reference_no ?? undefined,
    p_notes: input.notes ?? undefined,
  });

  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "23514" ? 409 : error.code === "P0002" ? 404 : 500;
    if (status === 500) log.error("record_payment failed", { err: error.message });
    return apiErr(error.message, status);
  }

  return apiOk(data, 201);
}
