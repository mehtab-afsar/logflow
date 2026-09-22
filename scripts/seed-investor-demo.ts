/**
 * Enrichment on top of the base seed, for a live investor walkthrough.
 *
 * Additive, not a replacement: run `npm run db:reset` first (or just after —
 * this only inserts/updates, it never deletes), then this. The base seed's
 * "2 of everything" contract stays intact for the tests and docs that assume
 * it; this exists separately so a demo rebuild never risks that.
 *
 * What this adds:
 *   · The Owner account is renamed to Mehtab — the login the demo uses.
 *   · The two seeded parties get real names and are tagged strictly
 *     consignor / consignee (the base seed leaves both as "both") — the
 *     LR form's two pickers only just started being properly separated by
 *     role, so this is also the fastest way to show that off.
 *   · Two more consignments, so the four together tell the whole story:
 *       - DRAFT        — created a minute ago, nothing sent yet
 *       - IN TRANSIT    (from the base seed) — a live driver + tracking link
 *       - POD VERIFIED  (from the base seed) — ready to bill
 *       - INVOICED     — a real bill raised through create_bill(), not
 *                         faked — so Freight Bills, the invoice PDF and the
 *                         Tally CSV all have something real to show
 *
 * Raising the bill needs a real authenticated request — create_bill() reads
 * the caller's org from their session, not a parameter, so unlike every
 * other write in this script it cannot go through the admin client. This
 * signs in through the same dev session-switcher the end-to-end suite uses,
 * gated behind DEV_AUTO_LOGIN exactly like it is everywhere else, and needs
 * the dev server running at NEXT_PUBLIC_APP_URL.
 *
 * Run with: npx tsx scripts/seed-investor-demo.ts
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";
import { gstinCheckDigit } from "../lib/india/validators";
import { computeTax } from "../lib/tax";
import { toPaise, fromPaise } from "../lib/money";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
if (!url || !serviceKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const db: SupabaseClient<Database> = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const BR_MAIN = "b0000000-0000-4000-8000-000000000001";
const CONSIGNOR_ID = "c0000000-0000-4000-8000-000000000001";
const CONSIGNEE_ID = "c0000000-0000-4000-8000-000000000002";
const VEHICLE_ID = "d0000000-0000-4000-8000-000000000001";
const DRIVER_ID = "e0000000-0000-4000-8000-000000000001";

const ORG_STATE = "29";

function gstin(stateCode: string, pan: string): string {
  const first14 = `${stateCode}${pan}1Z`;
  return first14 + gstinCheckDigit(first14);
}

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

async function move(id: string, to: string, at: string, payload: Record<string, string | number> = {}) {
  const { error } = await db.rpc("_apply_transition", {
    p_consignment_id: id, p_to_status: to, p_payload: payload as never,
    p_event_time: at, p_actor_type: "system", p_actor_user_id: null as unknown as string,
  });
  if (error) throw new Error(`transition ${to}: ${error.message}`);
}

async function main() {
  console.log("Building the investor walkthrough…\n");

  // ── Mehtab ────────────────────────────────────────────────────────────
  const { data: owner, error: ownerErr } = await db
    .from("profiles").update({ full_name: "Mehtab" })
    .eq("org_id", ORG_ID).eq("role", "owner").select("id").single();
  if (ownerErr || !owner) throw new Error(`rename owner: ${ownerErr?.message}`);
  console.log("  Owner renamed to Mehtab");

  // ── The organisation's own printed details ──────────────────────────────
  // Left as the seed's own placeholders otherwise, which read as an
  // unfinished TODO the moment "Print LR" is clicked.
  const { error: orgErr } = await db.from("organisations").update({
    address: "142, Peenya Industrial Area, 2nd Stage, Bengaluru 560058",
    bank_details: { bank: "HDFC Bank", branch: "Peenya", account: "50100123456789", ifsc: "HDFC0000123" },
  }).eq("id", ORG_ID);
  if (orgErr) throw new Error(`organisation: ${orgErr.message}`);

  // ── Consignor and consignee, properly separated ─────────────────────────
  // The base seed leaves both parties tagged "both". Strict roles here so
  // the LR form's two pickers each show one real option, not a shared pool.
  const consignorState = "29";
  const consigneeState = "33";
  const { error: cor } = await db.from("parties").update({
    name: "Vishwas Steel Traders",
    gstin: gstin(consignorState, "AAACV5566K"),
    state_code: consignorState,
    addresses: [{ label: "Office", line1: "4th Cross, Peenya Industrial Area", city: "Bengaluru", state_code: consignorState, pincode: "560058" }],
    party_role: "consignor",
  }).eq("id", CONSIGNOR_ID);
  if (cor) throw new Error(`consignor: ${cor.message}`);

  const { error: cee } = await db.from("parties").update({
    name: "Coastal Agro Distributors",
    gstin: gstin(consigneeState, "AABCC7788L"),
    state_code: consigneeState,
    addresses: [{ label: "Warehouse", line1: "18, Guindy Industrial Estate", city: "Chennai", state_code: consigneeState, pincode: "600032" }],
    party_role: "consignee",
  }).eq("id", CONSIGNEE_ID);
  if (cee) throw new Error(`consignee: ${cee.message}`);
  console.log("  Parties renamed and strictly tagged: consignor / consignee");

  const consignor = { id: CONSIGNOR_ID, name: "Vishwas Steel Traders", state: consignorState, gstin: gstin(consignorState, "AAACV5566K"), city: "Bengaluru" };
  const consignee = { id: CONSIGNEE_ID, name: "Coastal Agro Distributors", state: consigneeState, gstin: gstin(consigneeState, "AABCC7788L"), city: "Chennai" };

  // The two base-seed consignments freeze the party's details as they were
  // at creation time — deliberately, so a real customer's issued paperwork
  // never silently changes when a party record is edited later. Correct in
  // production; in a demo it just reads as two different company names on
  // the same register, so these two are patched to match for the walkthrough.
  const snapshotUpdate = {
    consignor_snapshot: { name: consignor.name, gstin: consignor.gstin, state_code: consignor.state, address: "4th Cross, Peenya Industrial Area, Bengaluru 560058" },
    consignee_snapshot: { name: consignee.name, gstin: consignee.gstin, state_code: consignee.state, address: "18, Guindy Industrial Estate, Chennai 600032" },
  };
  const { error: snapErr } = await db.from("consignments").update(snapshotUpdate).eq("org_id", ORG_ID).in("lr_no", ["LF-2627-000001", "LF-2627-000002"]);
  if (snapErr) throw new Error(`snapshot refresh: ${snapErr.message}`);
  console.log("  The two base-seed LRs' frozen party names refreshed to match");

  async function createConsignment(opts: {
    cargo: string; freight: number; loading: number; daysAgo: number; distanceKm: number;
  }) {
    const tax = computeTax({
      taxableValuePaise: toPaise(opts.freight + opts.loading),
      mode: "fcm_5", supplierStateCode: ORG_STATE,
      placeOfSupplyStateCode: consignee.state, exemptGoods: false,
    });
    const { data, error } = await db.from("consignments").insert({
      org_id: ORG_ID, branch_id: BR_MAIN,
      lr_date: daysFromNow(-opts.daysAgo),
      consignor_party_id: consignor.id,
      consignor_snapshot: { name: consignor.name, gstin: consignor.gstin, state_code: consignor.state, address: "4th Cross, Peenya Industrial Area, Bengaluru 560058" },
      consignee_party_id: consignee.id,
      consignee_snapshot: { name: consignee.name, gstin: consignee.gstin, state_code: consignee.state, address: "18, Guindy Industrial Estate, Chennai 600032" },
      origin_city: consignor.city, origin_state: consignor.state,
      destination_city: consignee.city, destination_state: consignee.state,
      distance_km: opts.distanceKm,
      cargo_description: opts.cargo,
      packages_count: 60, packages_unit: "bags",
      actual_weight_kg: 14_500, charged_weight_kg: 14_500,
      declared_value: 720_000,
      customer_invoice_no: `INV-${Math.floor(1000 + Math.random() * 9000)}`,
      customer_invoice_date: daysFromNow(-opts.daysAgo),
      ewb_no: "341200000099",
      ewb_valid_until: new Date(Date.now() + 96 * 3_600_000).toISOString(),
      freight: opts.freight, loading: opts.loading,
      tax_mode: "fcm_5", tax_rate_pct: tax.ratePct,
      cgst_amount: fromPaise(tax.cgstPaise), sgst_amount: fromPaise(tax.sgstPaise), igst_amount: fromPaise(tax.igstPaise),
      invoice_total: fromPaise(tax.invoiceTotalPaise),
      tax_snapshot: { mode: "fcm_5", supplier_state: ORG_STATE, pos_state: consignee.state, exempt: false, rate_pct: tax.ratePct, reason: tax.reason, note: tax.note },
      freight_terms: "to_be_billed",
      vehicle_id: VEHICLE_ID, driver_id: DRIVER_ID,
    }).select("id, lr_no").single();
    if (error) throw new Error(`consignment: ${error.message}`);
    return data!;
  }

  // ── 3: a fresh draft ─────────────────────────────────────────────────────
  const draft = await createConsignment({
    cargo: "Cold-rolled steel coils", freight: 31_000, loading: 1_200, daysAgo: 0, distanceKm: 350,
  });
  console.log(`  ${draft.lr_no}   draft`);

  // ── 4: the full loop, ending in a real bill ─────────────────────────────
  const billed = await createConsignment({
    cargo: "Fertiliser bags, 50kg", freight: 45_500, loading: 2_000, daysAgo: 6, distanceKm: 350,
  });
  await move(billed.id, "dispatched", hoursAgo(140), { advance: 15_000 });
  await move(billed.id, "in_transit", hoursAgo(130));
  await move(billed.id, "delivered", hoursAgo(110), { force: "true" });

  const { placeholderPodPng } = await import("./lib/placeholder-pod");
  const podClientId = crypto.randomUUID();
  const podPath = `${ORG_ID}/${billed.id}/${podClientId}.png`;
  const { error: upErr } = await db.storage.from("pods").upload(podPath, placeholderPodPng(1), { contentType: "image/png", upsert: true });
  if (upErr) throw new Error(`pod upload: ${upErr.message}`);
  await db.from("consignment_pods").insert({
    org_id: ORG_ID, consignment_id: billed.id, page_no: 1, storage_path: podPath,
    client_id: podClientId, uploaded_by_type: "driver", uploaded_at: hoursAgo(108),
  });
  await move(billed.id, "pod_verified", hoursAgo(107));
  console.log(`  ${billed.lr_no}   POD verified, raising a bill…`);

  // create_bill() reads the caller's org from their own session — it cannot
  // be called with the admin client, which has no session at all. Signs in
  // through the dev session-switcher, exactly as the end-to-end suite does.
  const sessionRes = await fetch(
    `${appUrl}/api/dev/session?email=owner@example.test&password=logiflow123`,
  );
  if (!sessionRes.ok) {
    throw new Error(
      `Could not sign in to raise the bill (${sessionRes.status}). ` +
        `Is the dev server running at ${appUrl} with DEV_AUTO_LOGIN=1?`,
    );
  }
  const cookie = sessionRes.headers.get("set-cookie") ?? "";

  const { data: taxable } = await db.from("consignments").select("taxable_value").eq("id", billed.id).single();
  const tax = computeTax({
    taxableValuePaise: toPaise(Number(taxable!.taxable_value)),
    mode: "fcm_5", supplierStateCode: ORG_STATE, placeOfSupplyStateCode: consignee.state, exemptGoods: false,
  });
  const billRes = await fetch(`${appUrl}/api/bills`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      branch_id: BR_MAIN, consignor_party_id: consignor.id, consignment_ids: [billed.id],
    }),
  });
  const billBody = await billRes.json();
  if (!billRes.ok) throw new Error(`create_bill: ${billBody.error}`);
  console.log(`  ${billBody.data.bill_no}   invoiced — ₹${(tax.invoiceTotalPaise / 100).toLocaleString("en-IN")}`);

  console.log(`
─────────────────────────────────────────────────────────────
  Ready for the walkthrough. Sign in as Mehtab (owner) —
  owner@example.test / logiflow123, or open the app directly.

  ${draft.lr_no}   draft          about to be dispatched
  LF-2627-000001   in transit     driver + tracking links live
  LF-2627-000002   POD verified   ready to bill
  ${billed.lr_no}   invoiced       ${billBody.data.bill_no} — Freight bills → PDF / Tally CSV

  Consignor   Vishwas Steel Traders (Bengaluru)
  Consignee   Coastal Agro Distributors (Chennai)
─────────────────────────────────────────────────────────────
`);
}

main().catch((err) => {
  console.error("\nBuild failed:", err.message);
  process.exit(1);
});
