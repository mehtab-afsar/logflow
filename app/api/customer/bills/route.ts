import { verifyCustomerAuth } from "@/lib/auth/verify-customer";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

/** A logged-in consignor's own bills — scoped by freight_bills_select_customer (migration 18). */
export async function GET() {
  const auth = await verifyCustomerAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("freight_bills")
    .select("id, bill_no, bill_date, taxable_value, total_amount")
    .order("bill_date", { ascending: false });

  if (error) {
    log.error("GET /api/customer/bills", { err: error.message });
    return apiErr("Could not load your bills", 500);
  }
  return apiOk(data);
}
