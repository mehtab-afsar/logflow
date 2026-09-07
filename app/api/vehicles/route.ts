import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { vehicleSchema } from "@/features/masters/schemas/masters";
import { requireMasterWrite, blank, CONFLICT_MESSAGE } from "@/lib/api/masters";
import { formatRegNumber } from "@/lib/india/validators";

export const runtime = "nodejs";

const COLUMNS =
  "id, reg_number, vehicle_type, capacity_tons, ownership, rc_expiry, fitness_expiry, insurance_expiry, permit_expiry, puc_expiry, created_at";

export async function GET() {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles").select(COLUMNS).is("deleted_at", null).order("reg_number");

  if (error) return apiErr("Could not load vehicles", 500);
  return apiOk(data);
}

export async function POST(req: NextRequest) {
  const guard = await requireMasterWrite();
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(req, vehicleSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const v = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      org_id: guard.ctx.orgId,
      // Stored in the dashed form the owner recognises on paper; the unique
      // index normalises separators, so KA01AB1234 still collides with this.
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
    .select(COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") return apiErr(CONFLICT_MESSAGE.vehicles, 409);
    log.error("POST /api/vehicles", { err: error.message });
    return apiErr("Could not save this vehicle", 500);
  }
  return apiOk(data, 201);
}
