import { type NextRequest } from "next/server";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { computeTax } from "@/lib/tax";
import { toPaise, fromPaise } from "@/lib/money";

export const runtime = "nodejs";

const schema = z.object({
  branch_id: z.string().uuid(),
  consignor_party_id: z.string().uuid(),
  consignment_ids: z.array(z.string().uuid()).min(1).max(200),
  bill_date: z.iso.date().optional(),
  notes: z.string().max(500).optional(),
});

export async function GET() {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("freight_bills")
    .select("id, bill_no, bill_date, party_snapshot, taxable_value, total_amount, tax_mode")
    .order("bill_date", { ascending: false })
    .limit(100);

  if (error) return apiErr("Could not load bills", 500);
  return apiOk(data);
}

/**
 * Batch freight bill.
 *
 * A consolidated date-range bill is the same call: the UI resolves the range to
 * ids first, so there is exactly one code path on the server.
 *
 * Tax is computed ONCE on the total, not per line. Rounding once is what Tally
 * expects; per-line rounding produces a drift that never reconciles.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);
  if (!["owner", "accounts"].includes(auth.ctx.role)) {
    return apiErr("Raising a bill requires the owner or accounts role", 403);
  }

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return apiErr(parsed.error, 400);
  const input = parsed.data;

  const supabase = await createClient();

  // RLS filters cross-tenant ids to zero rows, so a hostile list simply fails
  // the count check below rather than leaking whether those ids exist.
  const { data: rows, error: readError } = await supabase
    .from("consignments")
    .select("id, taxable_value, exempt_goods, consignee_snapshot, status, bill_id, branch_id, consignor_party_id")
    .in("id", input.consignment_ids);

  if (readError) return apiErr("Could not read the selected consignments", 500);
  if (!rows || rows.length !== input.consignment_ids.length) {
    return apiErr("Some selected consignments could not be found", 400);
  }

  const bad = rows.find(
    (r) =>
      r.status !== "pod_verified" ||
      r.bill_id !== null ||
      r.branch_id !== input.branch_id ||
      r.consignor_party_id !== input.consignor_party_id,
  );
  if (bad) {
    return apiErr(
      "Every selected consignment must be POD-verified, unbilled, in the same branch and for the same consignor",
      409,
    );
  }

  // A single bill cannot mix intra- and inter-state supplies: they carry
  // different tax mechanisms and would need two separate tax blocks.
  const states = new Set(
    rows.map((r) => (r.consignee_snapshot as { state_code?: string })?.state_code ?? ""),
  );
  if (states.size > 1) {
    return apiErr(
      "These consignments go to different states and cannot share one bill. Split them by destination state.",
      409,
    );
  }
  const exempt = new Set(rows.map((r) => r.exempt_goods));
  if (exempt.size > 1) {
    return apiErr("Exempt and taxable consignments cannot share one bill", 409);
  }

  const { data: org } = await supabase
    .from("organisations")
    .select("tax_mode, state_code")
    .eq("id", auth.ctx.orgId)
    .single();
  if (!org) return apiErr("Organisation not found", 404);

  const totalRupees = rows.reduce((s, r) => s + Number(r.taxable_value ?? 0), 0);
  const tax = computeTax({
    taxableValuePaise: toPaise(totalRupees),
    mode: org.tax_mode as "rcm" | "fcm_5" | "fcm_18",
    supplierStateCode: org.state_code,
    placeOfSupplyStateCode: [...states][0] || org.state_code,
    exemptGoods: [...exempt][0] ?? false,
  });

  const { data, error } = await supabase.rpc("create_bill", {
    p_branch_id: input.branch_id,
    p_party_id: input.consignor_party_id,
    p_consignment_ids: input.consignment_ids,
    p_bill_date: input.bill_date ?? new Date().toISOString().slice(0, 10),
    p_tax: {
      taxable_value: totalRupees,
      tax_mode: org.tax_mode,
      rate_pct: tax.ratePct,
      cgst: fromPaise(tax.cgstPaise),
      sgst: fromPaise(tax.sgstPaise),
      igst: fromPaise(tax.igstPaise),
      total: fromPaise(tax.invoiceTotalPaise),
      reason: tax.reason,
      note: tax.note,
    },
    p_notes: input.notes ?? undefined,
  });

  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "23514" ? 409 : 500;
    if (status === 500) log.error("create_bill failed", { err: error.message });
    return apiErr(error.message, status);
  }

  return apiOk(data, 201);
}
