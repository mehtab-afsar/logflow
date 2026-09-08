import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { requireOwner } from "@/lib/api/masters";
import { taxModeSchema } from "@/features/onboarding/schemas/onboarding";

export const runtime = "nodejs";

/**
 * A separate route from PATCH /api/organisations on purpose: this one field
 * changes every rupee on every document issued from today onward, which the
 * Settings UI makes the owner confirm explicitly rather than saving it
 * alongside an address edit. See app/(app)/settings — the caution copy this
 * route's callers must show is defined there, not here.
 *
 * No historical risk: tax_mode is copied onto each consignment at creation
 * (migration 05) and frozen there, so this can never rewrite a document
 * already issued.
 */
export async function PATCH(req: NextRequest) {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(req, taxModeSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organisations")
    .update({ tax_mode: parsed.data.tax_mode })
    .eq("id", guard.ctx.orgId)
    .select("id, tax_mode")
    .single();

  if (error) {
    log.error("PATCH /api/organisations/tax-mode", { err: error.message });
    return apiErr("Could not change the tax treatment", 500);
  }
  return apiOk(data);
}
