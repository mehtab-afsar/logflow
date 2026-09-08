import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { requireOwner } from "@/lib/api/masters";
import { inviteSchema } from "@/features/onboarding/schemas/onboarding";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("org_invites")
    .select("id, email, role, created_at, expires_at, accepted_at")
    .order("created_at", { ascending: false });

  if (error) return apiErr("Could not load invites", 500);
  return apiOk(data);
}

/**
 * Creates the pending seat, then sends the teammate a real magic-link email
 * immediately — no service role, no admin API. signInWithOtp is a public Auth
 * endpoint; calling it with someone else's address is exactly how "invite by
 * email" works without CLAUDE.md's service role ever entering the picture.
 * They land on /auth/callback with no profile yet, accept_org_invite() (see
 * the callback route) finds this row by their email and claims it.
 */
export async function POST(req: NextRequest) {
  const guard = await requireOwner();
  if (!guard.ok) return guard.response;

  const parsed = await parseBody(req, inviteSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const { email, role } = parsed.data;

  const supabase = await createClient();

  const { data: invite, error } = await supabase
    .from("org_invites")
    .insert({ org_id: guard.ctx.orgId, email, role, invited_by: guard.ctx.userId })
    .select("id, email, role, created_at, expires_at")
    .single();

  if (error) {
    log.error("POST /api/organisations/invites", { err: error.message });
    return apiErr("Could not create this invite", 500);
  }

  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${env.appUrl}/auth/callback` },
  });
  if (otpError) {
    // The invite row exists either way — the owner can share the sign-in
    // link manually, or Settings can offer "resend" later.
    log.warn("POST /api/organisations/invites: sign-in email not sent", { err: otpError.message });
  }

  return apiOk(invite, 201);
}
