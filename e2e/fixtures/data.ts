import { createClient } from "@supabase/supabase-js";
import { placeholderPodPng } from "../../scripts/lib/placeholder-pod";

/**
 * Provisions the data a test needs instead of consuming the demo seed.
 *
 * WHY: the suite bills every billable consignment and advances every dispatched
 * trip. Run against the seed alone it passes once, then starves itself. Tests
 * that consume a resource must create it.
 */
export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function org() {
  const { data } = await admin
    .from("organisations").select("id, state_code")
    .eq("legal_name", "Sample Transport Co").single();
  return data!;
}

export interface FreshTrip {
  id: string;
  lr_no: string;
  tracking_token: string;
  driverToken: string;
  consignorPartyId: string;
  branchId: string;
}

/**
 * Creates a consignment and walks it to `upTo` using the same engine the app
 * uses, so preconditions and event-writing are exercised rather than bypassed.
 */
export async function makeTrip(
  upTo: "draft" | "dispatched" | "in_transit" | "delivered" | "pod_verified" = "dispatched",
  opts: { consignorId?: string } = {},
): Promise<FreshTrip> {
  const o = await org();

  const [{ data: branch }, { data: parties }, { data: vehicle }, { data: driver }] =
    await Promise.all([
      admin.from("branches").select("id").eq("org_id", o.id).eq("lr_prefix", "LF").single(),
      admin.from("parties").select("id, name, gstin, state_code, addresses").eq("org_id", o.id).limit(6),
      admin.from("vehicles").select("id").eq("org_id", o.id).limit(1).single(),
      admin.from("drivers").select("id").eq("org_id", o.id).limit(1).single(),
    ]);

  const consignor = opts.consignorId
    ? parties!.find((p) => p.id === opts.consignorId)!
    : parties![0];
  const consignee = parties!.find((p) => p.id !== consignor.id)!;

  const snap = (p: typeof consignor) => ({
    name: p.name, gstin: p.gstin, state_code: p.state_code, address: "Test address",
  });

  const { data: c, error } = await admin.from("consignments").insert({
    org_id: o.id,
    branch_id: branch!.id,
    consignor_party_id: consignor.id,
    consignor_snapshot: snap(consignor),
    consignee_party_id: consignee.id,
    consignee_snapshot: snap(consignee),
    origin_city: "Bengaluru",
    origin_state: o.state_code,
    destination_city: "Test City",
    destination_state: consignee.state_code!,
    cargo_description: "E2E test cargo",
    freight: 10_000,
    tax_mode: "fcm_5",
    tax_rate_pct: 5,
    igst_amount: consignee.state_code === o.state_code ? 0 : 500,
    cgst_amount: consignee.state_code === o.state_code ? 250 : 0,
    sgst_amount: consignee.state_code === o.state_code ? 250 : 0,
    invoice_total: 10_500,
    tax_snapshot: { mode: "fcm_5", reason: consignee.state_code === o.state_code ? "intra_state" : "inter_state", rate_pct: 5 },
    vehicle_id: vehicle!.id,
    driver_id: driver!.id,
  }).select("id, lr_no, tracking_token").single();

  if (error) throw new Error(`makeTrip insert: ${error.message}`);

  const walk = ["dispatched", "in_transit", "delivered", "pod_verified"] as const;
  const stop = walk.indexOf(upTo as (typeof walk)[number]);

  for (let i = 0; i <= stop; i += 1) {
    const to = walk[i];

    if (to === "pod_verified") {
      // Upload a real image, not just a path. A dangling storage_path renders
      // a broken thumbnail on the LR detail page, which makes every screenshot
      // and every manual look at a provisioned trip appear broken.
      const clientId = crypto.randomUUID();
      const path = `${o.id}/${c!.id}/${clientId}.png`;
      await admin.storage
        .from("pods")
        .upload(path, placeholderPodPng(2), { contentType: "image/png", upsert: true });

      await admin.from("consignment_pods").insert({
        org_id: o.id, consignment_id: c!.id, page_no: 1,
        storage_path: path,
        client_id: clientId, uploaded_by_type: "office",
      });
    }

    const { error: tErr } = await admin.rpc("_apply_transition", {
      p_consignment_id: c!.id,
      p_to_status: to,
      p_payload: (to === "delivered" ? { force: "true" } : {}) as never,
      p_event_time: new Date().toISOString(),
      p_actor_type: "system",
      p_actor_user_id: null as unknown as string,
    });
    if (tErr) throw new Error(`makeTrip → ${to}: ${tErr.message}`);
  }

  const { data: tok } = await admin
    .from("access_tokens").select("token")
    .eq("consignment_id", c!.id).is("revoked_at", null).limit(1).maybeSingle();

  return {
    id: c!.id,
    lr_no: c!.lr_no,
    tracking_token: c!.tracking_token,
    driverToken: tok?.token ?? "",
    consignorPartyId: consignor.id,
    branchId: branch!.id,
  };
}
