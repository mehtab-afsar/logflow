import type { createClient } from "@/lib/supabase/server";

/**
 * Where a signed-in user actually belongs — shared by the callback route
 * (right after exchanging a magic-link code) and /login (for someone who is
 * already signed in and lands there again). Kept in one place because the
 * three-way decision — existing profile, pending invite, neither — must
 * agree everywhere it's asked, or one path sends an onboarded owner back
 * through the wizard while the other doesn't.
 *
 *  - a profile already exists → `next` (or /dashboard)
 *  - no profile, but a teammate invite is pending for their email →
 *    accept_org_invite() claims it and they land in the app with the role
 *    they were invited as, not the onboarding wizard
 *  - no profile and no invite → /start, self-serve or after a demo-call
 *    invite sent from the Supabase dashboard, either way landing on the
 *    wizard with no company yet
 */
export async function postSignInDestination(
  supabase: Awaited<ReturnType<typeof createClient>>,
  next: string,
): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return next;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profile) return next;

  const { data: accepted } = await supabase.rpc("accept_org_invite").maybeSingle();
  if (accepted) return next;

  return "/start";
}
