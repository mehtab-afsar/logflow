import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { contractSchema } from "@/features/masters/schemas/masters";
import { requireMasterWrite } from "@/lib/api/masters";

export const runtime = "nodejs";

const COLUMNS =
  "id, branch_id, counterparty_type, party_id, route_origin_city, route_origin_state, " +
  "route_destination_city, route_destination_state, vehicle_type, freight_basis, rate, " +
  "valid_from, valid_to, notes, created_at";

export async function GET() {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rate_contracts")
    .select(COLUMNS)
    .is("deleted_at", null)
    .order("valid_from", { ascending: false });

  if (error) return apiErr("Could not load contracts", 500);
  return apiOk(data);
}

export async function POST(req: NextRequest) {
  const guard = await requireMasterWrite();
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(req, contractSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const p = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rate_contracts")
    .insert({
      org_id: guard.ctx.orgId,
      branch_id: p.branch_id || null,
      counterparty_type: p.counterparty_type,
      party_id: p.party_id,
      route_origin_city: p.route_origin_city || null,
      route_origin_state: p.route_origin_state || null,
      route_destination_city: p.route_destination_city || null,
      route_destination_state: p.route_destination_state || null,
      vehicle_type: p.vehicle_type || null,
      freight_basis: p.freight_basis,
      rate: p.rate,
      valid_from: p.valid_from,
      valid_to: p.valid_to || null,
      notes: p.notes || null,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    log.error("POST /api/contracts", { err: error.message });
    return apiErr("Could not save this contract", 500);
  }
  return apiOk(data, 201);
}
