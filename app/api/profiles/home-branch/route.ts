import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verify";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { homeBranchSchema } from "@/features/onboarding/schemas/onboarding";

export const runtime = "nodejs";

/**
 * Sets the caller's OWN home branch — never anyone else's. There is no [id]
 * segment on purpose: this always acts on auth.uid(), which is exactly the
 * shape "profiles_update" (migration 02) already authorises (id = auth.uid()),
 * so no new RLS policy was needed for this.
 *
 * A role check would be the wrong shape here — an accounts clerk and a
 * dispatcher each has their own default branch just as much as an owner does.
 */
export async function PATCH(req: NextRequest) {
  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const parsed = await parseBody(req, homeBranchSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const { branch_id } = parsed.data;

  const supabase = await createClient();

  if (branch_id) {
    // Read it back through the user-scoped client rather than trust the id:
    // RLS hides another tenant's branch row exactly like a nonexistent one,
    // so a cross-org id and a typo look identical here — 404 either way,
    // never 403 (CLAUDE.md's second directive).
    const { data: branch } = await supabase
      .from("branches")
      .select("id")
      .eq("id", branch_id)
      .maybeSingle();
    if (!branch) return apiErr("No such branch", 404);
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ home_branch_id: branch_id })
    .eq("id", auth.ctx.userId)
    .select("id, home_branch_id")
    .single();

  if (error) {
    log.error("PATCH /api/profiles/home-branch", { err: error.message });
    return apiErr("Could not save your home branch", 500);
  }
  return apiOk(data);
}
