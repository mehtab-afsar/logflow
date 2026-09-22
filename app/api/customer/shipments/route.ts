import { verifyCustomerAuth } from "@/lib/auth/verify-customer";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const COLUMNS =
  "id, lr_no, lr_date, status, origin_city, destination_city, eta_text, invoice_total, bill_id";

/**
 * A logged-in consignor's own shipments — the customer dashboard's whole
 * reason to exist beyond an anonymous /track/[token] link: this can safely
 * show money (invoice_total), because it is gated by a real session and the
 * additive consignments_select_customer RLS policy (migration 18), not an
 * anonymous URL. No manual party_id filter needed in the query below — RLS
 * already scopes it; verifyCustomerAuth() runs first only so a signed-out
 * caller gets a clean 401 instead of a confusing empty list.
 */
export async function GET() {
  const auth = await verifyCustomerAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consignments")
    .select(COLUMNS)
    .order("lr_date", { ascending: false });

  if (error) {
    log.error("GET /api/customer/shipments", { err: error.message });
    return apiErr("Could not load your shipments", 500);
  }
  return apiOk(data);
}
