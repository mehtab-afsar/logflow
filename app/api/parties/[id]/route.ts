import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { partySchema } from "@/features/masters/schemas/masters";
import { requireMasterWrite, requireOwner, blank, CONFLICT_MESSAGE } from "@/lib/api/masters";
import { stateCodeFromGstin } from "@/lib/india/validators";

export const runtime = "nodejs";

const COLUMNS = "id, name, gstin, state_code, phone, email, addresses, party_role, notes, created_at";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMasterWrite();
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(req, partySchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const p = parsed.data;
  const gstin = blank(p.gstin);

  const supabase = await createClient();
  // RLS scopes the update, so another organisation's id matches no rows.
  const { data, error } = await supabase
    .from("parties")
    .update({
      name: p.name.trim(),
      gstin,
      state_code: gstin ? stateCodeFromGstin(gstin) : blank(p.state_code),
      phone: blank(p.phone),
      email: blank(p.email),
      addresses: p.addresses,
      party_role: p.party_role,
      notes: blank(p.notes),
    })
    .eq("id", id)
    .select(COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return apiErr(CONFLICT_MESSAGE.parties, 409);
    log.error("PATCH /api/parties", { err: error.message });
    return apiErr("Could not save your changes", 500);
  }
  if (!data) return apiErr("Not found", 404);
  return apiOk(data);
}

/**
 * Soft delete. Lorry receipts reference their party for years and the foreign
 * key is ON DELETE RESTRICT, so a hard delete would either fail or destroy
 * statutory history.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parties")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return apiErr("Could not remove this party", 500);
  if (!data) return apiErr("Not found", 404);
  return apiOk({ id, deleted: true });
}
