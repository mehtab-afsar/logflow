import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { chargeTypeSchema } from "@/features/masters/schemas/masters";
import { requireMasterWrite, CONFLICT_MESSAGE } from "@/lib/api/masters";

export const runtime = "nodejs";

const COLUMNS =
  "id, code, label, default_billable_to_consignor, default_billable_to_vendor, is_system, created_at";

export async function GET() {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("charge_types")
    .select(COLUMNS)
    .is("deleted_at", null)
    .order("is_system", { ascending: false })
    .order("label");

  if (error) return apiErr("Could not load charge types", 500);
  return apiOk(data);
}

export async function POST(req: NextRequest) {
  const guard = await requireMasterWrite();
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(req, chargeTypeSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const p = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("charge_types")
    .insert({
      org_id: guard.ctx.orgId,
      code: p.code.trim(),
      label: p.label.trim(),
      default_billable_to_consignor: p.default_billable_to_consignor,
      default_billable_to_vendor: p.default_billable_to_vendor,
      is_system: false,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") return apiErr(CONFLICT_MESSAGE.charge_types, 409);
    log.error("POST /api/charge-types", { err: error.message });
    return apiErr("Could not save this charge type", 500);
  }
  return apiOk(data, 201);
}
