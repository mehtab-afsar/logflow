import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { vehicleSchema } from "@/features/masters/schemas/masters";
import { requireMasterWrite, requireOwner, blank, CONFLICT_MESSAGE } from "@/lib/api/masters";
import { formatRegNumber } from "@/lib/india/validators";

export const runtime = "nodejs";

const COLUMNS =
  "id, reg_number, vehicle_type, capacity_tons, ownership, rc_expiry, fitness_expiry, insurance_expiry, permit_expiry, puc_expiry, created_at";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMasterWrite();
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(req, vehicleSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .update({
      reg_number: formatRegNumber(v.reg_number),
      vehicle_type: v.vehicle_type,
      capacity_tons: v.capacity_tons ?? null,
      ownership: v.ownership,
      rc_expiry: blank(v.rc_expiry),
      fitness_expiry: blank(v.fitness_expiry),
      insurance_expiry: blank(v.insurance_expiry),
      permit_expiry: blank(v.permit_expiry),
      puc_expiry: blank(v.puc_expiry),
    })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return apiErr(CONFLICT_MESSAGE.vehicles, 409);
    log.error("PATCH /api/vehicles", { err: error.message });
    return apiErr("Could not save your changes", 500);
  }
  if (!data) return apiErr("Not found", 404);
  return apiOk(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return apiErr("Could not remove this vehicle", 500);
  if (!data) return apiErr("Not found", 404);
  return apiOk({ id, deleted: true });
}
