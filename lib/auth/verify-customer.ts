import { createClient } from "@/lib/supabase/server";

export interface CustomerAuthContext {
  userId: string;
  orgId: string;
  partyId: string;
}

export type VerifyCustomerResult =
  | { ok: true; ctx: CustomerAuthContext }
  | { ok: false; error: string; status: 401 | 403 };

/**
 * The customer-tier equivalent of verifyAuth() (lib/auth/verify.ts) — reads
 * customer_accounts instead of profiles. A separate function, not a branch
 * inside verifyAuth(), because the two tiers must never be interchangeable:
 * a route that means "any signed-in customer" should not accidentally also
 * accept a staff session, and vice versa.
 *
 * Note this returns the caller's party for convenience only — it is not the
 * security boundary. RLS (the additive policies in migration 18) is. Every
 * app/api/customer/* route must still read through lib/supabase/server.ts
 * so the database enforces the party scope independently.
 */
export async function verifyCustomerAuth(): Promise<VerifyCustomerResult> {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "Not signed in", status: 401 };
  }

  const { data: account, error: accountError } = await supabase
    .from("customer_accounts")
    .select("id, org_id, party_id")
    .eq("id", userData.user.id)
    .single();

  if (accountError || !account) {
    return { ok: false, error: "No customer account for this login", status: 403 };
  }

  return {
    ok: true,
    ctx: { userId: account.id, orgId: account.org_id, partyId: account.party_id },
  };
}
