import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { chargeTypeSchema } from "@/features/masters/schemas/masters";
import { requireMasterWrite, requireOwner, CONFLICT_MESSAGE } from "@/lib/api/masters";

export const runtime = "nodejs";

const COLUMNS =
  "id, code, label, default_billable_to_consignor, default_billable_to_vendor, is_system, created_at";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMasterWrite();
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(req, chargeTypeSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const p = parsed.data;

  const supabase = await createClient();
  // RLS scopes the update, so another organisation's id matches no rows.
  const { data, error } = await supabase
    .from("charge_types")
    .update({
      code: p.code.trim(),
      label: p.label.trim(),
      default_billable_to_consignor: p.default_billable_to_consignor,
      default_billable_to_vendor: p.default_billable_to_vendor,
    })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return apiErr(CONFLICT_MESSAGE.charge_types, 409);
    log.error("PATCH /api/charge-types", { err: error.message });
    return apiErr("Could not save your changes", 500);
  }
  if (!data) return apiErr("Not found", 404);
  return apiOk(data);
}

/** Soft delete. Charge lines reference their type indefinitely (ON DELETE RESTRICT). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  const supabase = await createClient();

  // System types (FREIGHT/LOADING/UNLOADING/DETENTION/OTHER) are the home for
  // every pre-existing consignment's backfilled charge lines — never let one
  // be removed, even by the owner.
  const { data: existing } = await supabase
    .from("charge_types")
    .select("id, is_system")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return apiErr("Not found", 404);
  if (existing.is_system) return apiErr("System charge types cannot be removed", 403);

  const { data, error } = await supabase
    .from("charge_types")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return apiErr("Could not remove this charge type", 500);
  if (!data) return apiErr("Not found", 404);
  return apiOk({ id, deleted: true });
}
