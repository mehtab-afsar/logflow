import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { transitionSchema } from "@/features/consignments/schemas/consignment";

export const runtime = "nodejs";

/**
 * The only status mutator exposed to a session.
 *
 * All validation lives in the transition_consignment() RPC — legality of the
 * edge, per-target preconditions, side effects and the audit event are one
 * transaction there. This handler's whole job is to authenticate, validate the
 * shape of the request, and translate SQLSTATEs into HTTP.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // Next 16: params is a Promise

  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const parsed = await parseBody(req, transitionSchema);
  if (!parsed.ok) return apiErr(parsed.error, 400);
  const { to_status, event_time, ...rest } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transition_consignment", {
    p_consignment_id: id,
    p_to_status: to_status,
    p_payload: rest,
    p_event_time: event_time ?? new Date().toISOString(),
  });

  if (error) {
    // 42501 forbidden · 23514 precondition or illegal edge · P0002 not found.
    // Anything else is a bug rather than a rejected business rule, so log it.
    const KNOWN = ["42501", "23514", "P0002"];
    if (!KNOWN.includes(error.code ?? "")) {
      log.error("transition failed unexpectedly", { err: error.message, code: error.code, id });
      return apiErr("Could not update this consignment", 500);
    }
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : 409;
    return apiErr(error.message, status);
  }

  return apiOk(data);
}
