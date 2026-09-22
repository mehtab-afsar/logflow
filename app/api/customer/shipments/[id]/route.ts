import { verifyCustomerAuth } from "@/lib/auth/verify-customer";
import { createClient } from "@/lib/supabase/server";
import { apiErr, apiOk } from "@/lib/api/response";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

const COLUMNS =
  "id, lr_no, lr_date, status, origin_city, destination_city, cargo_description, eta_text, invoice_total, bill_id, delivered_at, pod_verified_at";

/**
 * One shipment's detail, including its timeline — track & trace's
 * authenticated half (plan step 5). Selects consignments joined to
 * consignment_events directly, not through track_consignment() (the
 * anonymous whitelist RPC that deliberately hides money): a logged-in
 * customer viewing their OWN shipment is allowed to see their own
 * freight/bill status, so there is no second whitelist to maintain here.
 *
 * A foreign or nonexistent id is a 404, never a 403 — RLS already makes a
 * cross-party id invisible; this route just confirms that rather than
 * distinguishing "not yours" from "does not exist".
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await verifyCustomerAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const { data: shipment } = await supabase.from("consignments").select(COLUMNS).eq("id", id).maybeSingle();
  if (!shipment) return apiErr("Not found", 404);

  const { data: events, error } = await supabase
    .from("consignment_events")
    .select("kind, milestone, to_status, event_time, location_name")
    .eq("consignment_id", id)
    .order("event_time");

  if (error) {
    log.error("GET /api/customer/shipments/[id]", { err: error.message });
    return apiErr("Could not load this shipment's timeline", 500);
  }

  return apiOk({ ...shipment, events: events ?? [] });
}
