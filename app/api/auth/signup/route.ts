import { type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseBody } from "@/lib/api/validate";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { signUpSchema } from "@/features/onboarding/schemas/onboarding";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Email + password, no confirmation email — a beta-stage decision, not a
 * permanent one: the founder does not want a new signup blocked on clicking
 * a link before they can even see the product. Reusing supabase.auth.signUp
 * client-side would still gate on the project's "Confirm email" dashboard
 * toggle (on by default, and easy to forget is on for a hosted project this
 * session cannot reach without dashboard access) — this route sidesteps that
 * entirely by creating the user through the admin API with
 * `email_confirm: true` set at creation time, so the account is real and
 * usable regardless of that toggle. The client then calls
 * signInWithPassword() itself to establish its own session — this route
 * never creates one on the caller's behalf (no server actions, no session to
 * hand back through a JSON response).
 *
 * Rate-limited per IP: with no confirmation step, nothing else stops a
 * script from creating accounts.
 */
export async function POST(req: NextRequest) {
  const limit = rateLimit(`signup:${clientIp(req.headers)}`, 5, 60 * 60_000);
  if (!limit.ok) {
    return apiErr("Too many signup attempts — try again later", 429);
  }

  const parsed = await parseBody(req, signUpSchema);
  if (!parsed.ok) return apiErr(parsed.error, 422);
  const { email, password } = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    if (error.code === "email_exists" || error.status === 422) {
      return apiErr("An account with that email already exists — sign in instead", 409);
    }
    log.error("POST /api/auth/signup", { err: error.message });
    return apiErr("Could not create your account", 500);
  }

  return apiOk({ email }, 201);
}
