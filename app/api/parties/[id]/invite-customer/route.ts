import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireMasterWrite } from "@/lib/api/masters";
import { apiErr, apiOk } from "@/lib/api/response";
import { apiErrFromRpc } from "@/lib/api/rpc-error";
import { log } from "@/lib/logger";
import { env } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Provisions the customer portal for a party's contact — the one legitimate
 * new "service role after the caller is authorised" use this feature adds
 * (see lib/supabase/admin.ts's own list: POD upload, signed URLs, the PDF
 * cache — inviting a customer login joins that list here, not there, since
 * it is route-specific, not a shared helper).
 *
 * requireMasterWrite() (owner/dispatcher) runs FIRST — the admin client is
 * only ever reached once the caller is confirmed authorised, same ordering
 * as every other legitimate service-role call in this app.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMasterWrite();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  if (!email || !email.includes("@")) return apiErr("A valid email is required", 422);

  // Confirm the party belongs to this org before spending an invite email on
  // it — RLS would refuse link_customer_account's own party lookup anyway,
  // but this gives a clean 404 rather than a raw RPC error for the common
  // typo-in-the-url case.
  const supabase = await createClient();
  const { data: party } = await supabase.from("parties").select("id").eq("id", id).maybeSingle();
  if (!party) return apiErr("Not found", 404);

  const admin = createAdminClient();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    // Not /auth/callback — inviteUserByEmail is server-initiated, with no
    // browser code_verifier to pair a PKCE `?code=` against, so Supabase can
    // only give this link the implicit flow (a `#access_token=` fragment).
    // /auth/invite is the client page that actually knows how to land one —
    // see its own comment for why a route.ts handler cannot.
    redirectTo: `${env.appUrl}/auth/invite`,
  });

  if (inviteError || !invited.user) {
    log.error("POST /api/parties/[id]/invite-customer: inviteUserByEmail", { err: inviteError?.message });
    return apiErr("Could not send the invite — check the email address", 500);
  }

  const { data, error } = await supabase.rpc("link_customer_account", {
    p_user_id: invited.user.id,
    p_party_id: id,
  });

  if (error) return apiErrFromRpc("POST /api/parties/[id]/invite-customer", error);
  return apiOk(data, 201);
}
