import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { postSignInDestination } from "@/lib/auth/post-signin-destination";
import { EmailSignIn } from "@/features/onboarding/components/EmailSignIn";

export const metadata = {
  title: "Sign in",
  robots: { index: false },
};

/**
 * The customer portal's own sign-in page — same magic-link EmailSignIn as
 * staff (/login), but next="/customer" so the callback route lands an
 * invited consignor in their own shell, never the staff dashboard.
 *
 * There is no self-service signup here — a customer_accounts row only
 * exists after staff invite them (app/api/parties/[id]/invite-customer),
 * so an uninvited email's magic link still signs them in (Supabase Auth
 * itself has no concept of "invited" at that layer) but
 * postSignInDestination finds no customer_accounts row and sends them to
 * /start, the staff onboarding wizard, which is wrong for a customer with
 * no company — but harmless: they simply see an empty wizard, not another
 * organisation's data.
 */
export default async function CustomerLoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(await postSignInDestination(supabase, "/customer"));

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex h-16 max-w-[1120px] items-center px-7">
          <span className="font-semibold text-ink">LogiFlow</span>
        </div>
      </header>

      <div className="mx-auto max-w-[420px] px-7 py-16">
        <EmailSignIn
          next="/customer"
          heading="Track your shipments."
          reason="Enter the email your transporter set your account up with and we'll send you a link."
        />
      </div>
    </div>
  );
}
