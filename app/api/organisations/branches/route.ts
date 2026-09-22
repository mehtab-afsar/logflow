import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { requireOwner } from "@/lib/api/masters";
import { branchCreateSchema } from "@/features/onboarding/schemas/onboarding";
import { financialYearCode } from "@/lib/india/fy";

export const runtime = "nodejs";

const COLUMNS = "id, name, city, state_code, lr_prefix, inv_prefix, is_active, created_at";

export async function GET() {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  const supabase = await createClient();
  const { data, error } = await supabase.from("branches").select(COLUMNS).order("name");
  if (error) return apiErr("Could not load branches", 500);
  return apiOk(data);
}

/**
 * A second (or third) branch, added from Settings — the same fields
 * onboarding asks for its first one. Plain RLS-covered inserts suffice here:
 * unlike the very first branch, the caller already has an owner profile, so
 * branches_insert's policy (migration 02) applies normally and no
 * SECURITY DEFINER function is needed.
 */
export async function POST(req: NextRequest) {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(req, branchCreateSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const v = parsed.data;

  const supabase = await createClient();
  const { data: branch, error } = await supabase
    .from("branches")
    .insert({
      org_id: guard.ctx.orgId,
      name: v.name,
      city: v.city || null,
      state_code: v.state_code || null,
      lr_prefix: v.lr_prefix,
      inv_prefix: v.inv_prefix,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiErr("That branch name, LR prefix or invoice prefix is already in use", 409);
    }
    log.error("POST /api/organisations/branches", { err: error.message });
    return apiErr("Could not add this branch", 500);
  }

  const fy = financialYearCode(new Date());
  // document_sequences is deny-all under RLS (migration 04) — nothing here can
  // write it directly. seed_document_sequence() is the owner-gated
  // SECURITY DEFINER function for exactly this (migration 14), the same shape
  // as create_organisation's own seeding, kept out of the service role.
  if (v.lr_starting_number > 0) {
    const { error: seedError } = await supabase.rpc("seed_document_sequence", {
      p_branch_id: branch.id, p_doc_type: "LR", p_fy: fy, p_starting_number: v.lr_starting_number,
    });
    if (seedError) log.error("POST /api/organisations/branches seed LR", { err: seedError.message });
  }
  if (v.inv_starting_number > 0) {
    const { error: seedError } = await supabase.rpc("seed_document_sequence", {
      p_branch_id: branch.id, p_doc_type: "INV", p_fy: fy, p_starting_number: v.inv_starting_number,
    });
    if (seedError) log.error("POST /api/organisations/branches seed INV", { err: seedError.message });
  }

  return apiOk(branch, 201);
}
