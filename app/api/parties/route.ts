import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { partySchema } from "@/features/masters/schemas/masters";
import { requireMasterWrite, blank, CONFLICT_MESSAGE } from "@/lib/api/masters";
import { stateCodeFromGstin } from "@/lib/india/validators";

export const runtime = "nodejs";

const COLUMNS = "id, name, gstin, state_code, phone, email, addresses, party_role, notes, created_at";

export async function GET() {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parties").select(COLUMNS).is("deleted_at", null).order("name");

  if (error) return apiErr("Could not load parties", 500);
  return apiOk(data);
}

export async function POST(req: NextRequest) {
  const guard = await requireMasterWrite();
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(req, partySchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const p = parsed.data;

  const gstin = blank(p.gstin);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("parties")
    .insert({
      org_id: guard.ctx.orgId,
      name: p.name.trim(),
      gstin,
      // The first two digits of a GSTIN are the state, and place of supply
      // drives IGST vs CGST+SGST. Deriving it removes a field the dispatcher
      // can get wrong.
      state_code: gstin ? stateCodeFromGstin(gstin) : blank(p.state_code),
      phone: blank(p.phone),
      email: blank(p.email),
      addresses: p.addresses,
      party_role: p.party_role,
      notes: blank(p.notes),
    })
    .select(COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") return apiErr(CONFLICT_MESSAGE.parties, 409);
    log.error("POST /api/parties", { err: error.message });
    return apiErr("Could not save this party", 500);
  }
  return apiOk(data, 201);
}
