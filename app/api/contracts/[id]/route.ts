import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { contractSchema } from "@/features/masters/schemas/masters";
import { requireMasterWrite, requireOwner } from "@/lib/api/masters";

export const runtime = "nodejs";

const COLUMNS =
  "id, branch_id, counterparty_type, party_id, route_origin_city, route_origin_state, " +
  "route_destination_city, route_destination_state, vehicle_type, freight_basis, rate, " +
  "valid_from, valid_to, notes, created_at";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMasterWrite();
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(req, contractSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const p = parsed.data;

  const supabase = await createClient();
  // RLS scopes the update, so another organisation's id matches no rows.
  const { data, error } = await supabase
    .from("rate_contracts")
    .update({
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
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();

  if (error) {
    log.error("PATCH /api/contracts", { err: error.message });
    return apiErr("Could not save your changes", 500);
  }
  if (!data) return apiErr("Not found", 404);
  return apiOk(data);
}

/** Soft delete. Historical bookings that resolved against this contract keep a coherent trail. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rate_contracts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return apiErr("Could not remove this contract", 500);
  if (!data) return apiErr("Not found", 404);
  return apiOk({ id, deleted: true });
}
