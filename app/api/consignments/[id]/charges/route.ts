import { type NextRequest } from "next/server";
import { z } from "zod";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const COLUMNS =
  "id, consignment_id, charge_type_id, description, amount, billable_to_consignor, billable_to_vendor, created_at";

const chargeLineSchema = z.object({
  charge_type_id: z.string().uuid(),
  description: z.string().max(200).optional().nullable(),
  amount: z.number().min(0, "cannot be negative").max(99_999_999),
  billable_to_consignor: z.boolean().default(true),
  billable_to_vendor: z.boolean().default(false),
});

const WRITE_ROLES = ["owner", "dispatcher", "accounts"] as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();

  // RLS scopes consignments to our org, so a cross-tenant id is a 404, not a
  // 403 — we must not confirm that another organisation's LR exists.
  const { data: consignment } = await supabase
    .from("consignments")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!consignment) return apiErr("Not found", 404);

  const { data, error } = await supabase
    .from("consignment_charge_lines")
    .select(COLUMNS)
    .eq("consignment_id", id)
    .order("created_at");

  if (error) {
    log.error("GET /api/consignments/[id]/charges", { err: error.message });
    return apiErr("Could not load charge lines", 500);
  }
  return apiOk(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);
  if (!WRITE_ROLES.includes(auth.ctx.role as (typeof WRITE_ROLES)[number])) {
    return apiErr("Adding a charge line requires the owner, dispatcher or accounts role", 403);
  }

  const parsed = await parseBody(req, chargeLineSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const p = parsed.data;

  const supabase = await createClient();

  const { data: consignment } = await supabase
    .from("consignments")
    .select("id, bill_id")
    .eq("id", id)
    .maybeSingle();
  if (!consignment) return apiErr("Not found", 404);
  if (consignment.bill_id) return apiErr("This consignment is already billed — charges are frozen", 409);

  const { data, error } = await supabase
    .from("consignment_charge_lines")
    .insert({
      org_id: auth.ctx.orgId,
      consignment_id: id,
      charge_type_id: p.charge_type_id,
      description: p.description || null,
      amount: p.amount,
      billable_to_consignor: p.billable_to_consignor,
      billable_to_vendor: p.billable_to_vendor,
      created_by: auth.ctx.userId,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    log.error("POST /api/consignments/[id]/charges", { err: error.message });
    return apiErr("Could not add this charge line", 500);
  }
  return apiOk(data, 201);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);
  if (!WRITE_ROLES.includes(auth.ctx.role as (typeof WRITE_ROLES)[number])) {
    return apiErr("Removing a charge line requires the owner, dispatcher or accounts role", 403);
  }

  const lineId = req.nextUrl.searchParams.get("line_id");
  if (!lineId) return apiErr("line_id is required", 400);

  const supabase = await createClient();

  const { data: consignment } = await supabase
    .from("consignments")
    .select("id, bill_id")
    .eq("id", id)
    .maybeSingle();
  if (!consignment) return apiErr("Not found", 404);
  if (consignment.bill_id) return apiErr("This consignment is already billed — charges are frozen", 409);

  const { data, error } = await supabase
    .from("consignment_charge_lines")
    .delete()
    .eq("id", lineId)
    .eq("consignment_id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    log.error("DELETE /api/consignments/[id]/charges", { err: error.message });
    return apiErr("Could not remove this charge line", 500);
  }
  if (!data) return apiErr("Not found", 404);
  return apiOk({ id: lineId, deleted: true });
}
