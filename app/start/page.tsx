import { financialYearCode } from "@/lib/india/fy";
import { OnboardingWizard } from "@/features/onboarding/components/OnboardingWizard";

export const metadata = {
  title: "Set up your pilot",
  description: "Five questions and your first lorry receipt is ready.",
  robots: { index: false },
};

/**
 * The financial year is resolved here rather than inside the client wizard so
 * the LR preview renders identically on the server and after hydration.
 */
export default function StartPage() {
  return <OnboardingWizard fyCode={financialYearCode(new Date())} />;
}
