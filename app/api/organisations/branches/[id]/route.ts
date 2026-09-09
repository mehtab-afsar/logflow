import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { requireOwner } from "@/lib/api/masters";
import { branchUpdateSchema } from "@/features/onboarding/schemas/onboarding";

export const runtime = "nodejs";

const COLUMNS = "id, name, city, state_code, lr_prefix, inv_prefix, is_active, created_at";

/**
 * lr_prefix/inv_prefix are only editable while the branch has never issued a
 * document — the prefix is baked into every number next_doc_number() has
 * already returned, so changing it afterwards would make LR-2627-000012 and
 * LR-2627-000013 carry different prefixes for no reason a customer could make
 * sense of. document_sequences having any row for this branch is exactly
 * "has this branch issued anything", so that is the check.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const parsed = await parseBody(req, branchUpdateSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const v = parsed.data;

  const supabase = await createClient();

  if (v.lr_prefix !== undefined || v.inv_prefix !== undefined) {
    // document_sequences is deny-all under RLS — a direct SELECT would
    // silently read as "nothing issued" regardless of the truth. This RPC is
    // the one sanctioned way to ask the real question.
    const { data: issued, error: issuedError } = await supabase.rpc(
      "branch_has_issued_documents",
      { p_branch_id: id },
    );
    if (issuedError) {
      log.error("PATCH /api/organisations/branches/[id] issued-check", { err: issuedError.message });
      return apiErr("Could not verify this branch's document history", 500);
    }
    if (issued) {
      return apiErr(
        "This branch has already issued a document — its LR and invoice prefixes can no longer change",
        409,
      );
    }
  }

  const { data, error } = await supabase
    .from("branches")
    .update({
      ...(v.name !== undefined && { name: v.name }),
      ...(v.city !== undefined && { city: v.city || null }),
      ...(v.state_code !== undefined && { state_code: v.state_code || null }),
      ...(v.is_active !== undefined && { is_active: v.is_active }),
      ...(v.lr_prefix !== undefined && { lr_prefix: v.lr_prefix }),
      ...(v.inv_prefix !== undefined && { inv_prefix: v.inv_prefix }),
    })
    .eq("id", id)
    .select(COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      return apiErr("That name or prefix is already used by another branch", 409);
    }
    log.error("PATCH /api/organisations/branches/[id]", { err: error.message });
    return apiErr("Could not save this branch", 500);
  }
  return apiOk(data);
}
