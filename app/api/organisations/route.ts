import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { requireOwner } from "@/lib/api/masters";
import { createOrganisationSchema, organisationProfileSchema } from "@/features/onboarding/schemas/onboarding";

export const runtime = "nodejs";

/**
 * POST creates the organisation; PATCH edits it afterwards. Deliberately one
 * route split by verb rather than two routes, because both act on "the
 * organisation" as a single resource — creation is just the update an
 * org-less account is allowed to make exactly once.
 *
 * POST cannot use verifyAuth()/requireOwner(): both require a profiles row to
 * already exist, which is precisely what this call is about to create. The
 * check here is only "is there a signed-in Supabase user at all" — the RPC
 * itself is the authorisation boundary (see migration 20260908000001, which
 * rejects a caller who already has a profile).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return apiErr("Not signed in", 401);
  }

  const parsed = await parseBody(req, createOrganisationSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const v = parsed.data;

  const { data, error } = await supabase
    .rpc("create_organisation", {
      p_legal_name: v.legal_name,
      p_gstin: v.gstin ?? "",
      p_transin: v.transin ?? "",
      p_pan: v.pan ?? "",
      p_state_code: v.state_code,
      p_address: v.address ?? "",
      p_tax_mode: v.tax_mode,
      p_risk_clause: v.risk_clause,
      p_branch_name: v.branch_name,
      p_branch_city: v.branch_city ?? "",
      p_lr_prefix: v.lr_prefix,
      p_inv_prefix: v.inv_prefix,
      p_lr_starting_number: v.lr_starting_number,
      p_inv_starting_number: v.inv_starting_number,
    })
    .single();

  if (error) {
    if (error.code === "23505") {
      // Either "already belongs to an organisation" (raised by the function
      // itself) or the branch prefix unique index — both are 23505, and both
      // read fine as a conflict to whoever is filling in this form.
      return apiErr(
        error.message.includes("already belongs")
          ? "This account is already set up — go to your dashboard"
          : "That LR or invoice prefix is already in use",
        409,
      );
    }
    log.error("POST /api/organisations", { err: error.message });
    return apiErr("Could not set up your organisation", 500);
  }

  return apiOk(data, 201);
}

export async function PATCH(req: NextRequest) {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(req, organisationProfileSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const v = parsed.data;

  const supabase = await createClient();

  // The four flat bank_* fields exist only so a validation error lands on the
  // right form input (see the schema comment) — assembled into the one jsonb
  // column here, right before the write.
  const bankFieldsSent =
    v.bank_name !== undefined || v.bank_branch !== undefined ||
    v.bank_account !== undefined || v.bank_ifsc !== undefined;

  const { data, error } = await supabase
    .from("organisations")
    .update({
      legal_name: v.legal_name,
      gstin: v.gstin || null,
      transin: v.transin || null,
      pan: v.pan || null,
      state_code: v.state_code,
      address: v.address || null,
      // Only overwritten when the caller sent them — organisationProfileSchema
      // makes both optional, so PATCHing just the address, say, cannot blank
      // out the risk clause or bank details set on a separate call.
      ...(v.risk_clause !== undefined ? { risk_clause: v.risk_clause } : {}),
      ...(bankFieldsSent
        ? {
            bank_details: {
              bank: v.bank_name || "", branch: v.bank_branch || "",
              account: v.bank_account || "", ifsc: v.bank_ifsc || "",
            },
          }
        : {}),
    })
    .eq("id", guard.ctx.orgId)
    .select("*")
    .single();

  if (error) {
    log.error("PATCH /api/organisations", { err: error.message });
    return apiErr("Could not save these changes", 500);
  }
  return apiOk(data);
}
