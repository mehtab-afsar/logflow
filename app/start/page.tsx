import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { financialYearCode } from "@/lib/india/fy";
import { OnboardingWizard } from "@/features/onboarding/components/OnboardingWizard";

export const metadata = {
  title: "Set up your company",
  description: "A few questions and your first lorry receipt is ready.",
  robots: { index: false },
};

/**
 * Three states, one route:
 *
 *  - no session → the wizard's own email step, nothing known yet
 *  - session, profile already exists → nothing to onboard, done already
 *  - session, no profile → the wizard, skipping the email step (we already
 *    know who they are) — this is where a demo-call invite link lands too,
 *    via /auth/callback finding no profile and no matching invite
 */
export default async function StartPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profile) redirect("/dashboard");
  }

  return (
    <OnboardingWizard
      fyCode={financialYearCode(new Date())}
      signedInEmail={data.user?.email ?? null}
    />
  );
}
