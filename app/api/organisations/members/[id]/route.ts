import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { requireOwner } from "@/lib/api/masters";
import { memberRoleSchema } from "@/features/onboarding/schemas/onboarding";

export const runtime = "nodejs";

/**
 * Role changes only. Deactivating a member is a separate, larger feature:
 * every RLS policy that gates a write on has_role() would need to also check
 * an is_active flag, which touches parties/vehicles/drivers/consignments —
 * far past "let Settings edit what onboarding set". A half-built deactivate
 * (hidden from a list, but still able to create an LR) would be worse than
 * none, so it is left out rather than shipped incomplete.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const parsed = await parseBody(req, memberRoleSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const { role } = parsed.data;

  const supabase = await createClient();

  const { data: target, error: findError } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", id)
    .single();
  if (findError || !target) return apiErr("No such member", 404);

  if (target.role === "owner" && role !== "owner") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      return apiErr("This is the only owner — promote someone else first", 409);
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", id)
    .select("id, full_name, role")
    .single();

  if (error) {
    log.error("PATCH /api/organisations/members/[id]", { err: error.message });
    return apiErr("Could not change this member's role", 500);
  }
  return apiOk(data);
}
