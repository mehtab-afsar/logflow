import { verifyCustomerAuth } from "@/lib/auth/verify-customer";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/api/response";
import { apiErrFromRpc } from "@/lib/api/rpc-error";

export const runtime = "nodejs";

/**
 * Wraps the zero-argument customer_outstanding() (migration 18) — no
 * party_id parameter for a compromised client to substitute; it reads
 * current_customer_party_id() internally.
 */
export async function GET() {
  const auth = await verifyCustomerAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("customer_outstanding");

  if (error) return apiErrFromRpc("GET /api/customer/outstanding", error);
  return apiOk(data);
}
