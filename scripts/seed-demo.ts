/**
 * Starter data.
 *
 * Deliberately minimal: two of everything, clearly labelled as samples, so the
 * app opens on something real enough to understand and small enough to delete.
 * There is no fictional transport company here — replace these rows with your
 * own and the demo dataset is gone.
 *
 * The two vehicles differ on purpose: one has a document expiring inside the
 * 30-day window, so the fleet badge and the dashboard KPI have something true
 * to report rather than sitting at zero.
 *
 * The two consignments are at different points of the lifecycle:
 *   · one IN TRANSIT   — has a live driver link and a public tracking link
 *   · one POD VERIFIED — ready to bill, so the billing flow works immediately
 *
 * Run with: npm run db:reset
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";
import { gstinCheckDigit } from "../lib/india/validators";
import { computeTax } from "../lib/tax";
import { toPaise, fromPaise } from "../lib/money";
import { placeholderPodPng } from "./lib/placeholder-pod";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !serviceKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const db: SupabaseClient<Database> = createClient<Database>(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ORG_ID = "a0000000-0000-4000-8000-000000000001";
const BR_MAIN = "b0000000-0000-4000-8000-000000000001";
const BR_SECOND = "b0000000-0000-4000-8000-000000000002";

/** Build a GSTIN with a correct mod-36 check digit, so validation passes. */
function gstin(stateCode: string, pan: string, entity = "1"): string {
  const first14 = `${stateCode}${pan}${entity}Z`;
  return first14 + gstinCheckDigit(first14);
}

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const ORG_STATE = "29"; // Karnataka

interface SampleParty {
  id: string; name: string; state: string; pan: string;
  city: string; pin: string; phone: string;
}

const PARTIES: readonly SampleParty[] = [
  {
    id: "c0000000-0000-4000-8000-000000000001",
    name: "Sample Consignor Pvt Ltd",
    state: "29", pan: "AAACS1234F", city: "Bengaluru", pin: "560058",
    phone: "9845000001",
  },
  {
    id: "c0000000-0000-4000-8000-000000000002",
    name: "Sample Consignee LLP",
    state: "33", pan: "AABCS5678G", city: "Chennai", pin: "600032",
    phone: "9845000002",
  },
];

const VEHICLES = [
  // Healthy: every document well inside its window.
  { id: "d0000000-0000-4000-8000-000000000001", reg: "KA-01-AB-1234", type: "32ft SXL", cap: 18, fitness: 240 },
  // Fitness expires in 6 days, so the amber badge and the "documents expiring"
  // KPI show a real value instead of zero.
  { id: "d0000000-0000-4000-8000-000000000002", reg: "KA-02-CD-5678", type: "22ft", cap: 9, fitness: 6 },
] as const;

const DRIVERS = [
  { id: "e0000000-0000-4000-8000-000000000001", name: "Sample Driver One", phone: "9845100001", lang: "hi", dl: "KA0120200001111" },
  { id: "e0000000-0000-4000-8000-000000000002", name: "Sample Driver Two", phone: "9845100002", lang: "en", dl: "KA0220200002222" },
] as const;

const USERS = [
  { email: "owner@example.test",    name: "Owner",      role: "owner" },
  { email: "dispatch@example.test", name: "Dispatcher", role: "dispatcher" },
  { email: "accounts@example.test", name: "Accounts",   role: "accounts" },
  { email: "viewer@example.test",   name: "Viewer",     role: "viewer" },
] as const;

const PASSWORD = "logiflow123";

async function main() {
  console.log("Seeding starter data…\n");

  // ── Organisation and branches ───────────────────────────────────────────
  await db.from("organisations").insert({
    id: ORG_ID,
    legal_name: "Sample Transport Co",
    gstin: gstin(ORG_STATE, "AAACT1234E"),
    pan: "AAACT1234E",
    state_code: ORG_STATE,
    address: "Replace this with your registered address",
    tax_mode: "fcm_5",
    risk_clause: "At owner's risk",
    bank_details: { bank: "Your bank", branch: "Your branch", account: "000000000000", ifsc: "ABCD0000000" },
  });

  // Two branches: document numbers are sequenced per branch, and the prefixes
  // must differ or the two would mint colliding invoice numbers.
  await db.from("branches").insert([
    { id: BR_MAIN,   org_id: ORG_ID, name: "Head Office",    city: "Bengaluru", state_code: "29", lr_prefix: "LF", inv_prefix: "INV" },
    { id: BR_SECOND, org_id: ORG_ID, name: "Second Branch",  city: "Hosur",     state_code: "33", lr_prefix: "LH", inv_prefix: "INVH" },
  ]);
  console.log("  1 organisation · 2 branches");

  // ── Staff ───────────────────────────────────────────────────────────────
  for (const u of USERS) {
    const { data: created, error } = await db.auth.admin.createUser({
      email: u.email, password: PASSWORD, email_confirm: true,
      user_metadata: { full_name: u.name },
    });
    if (error || !created.user) throw new Error(`createUser ${u.email}: ${error?.message}`);
    const { error: pErr } = await db.from("profiles").insert({
      id: created.user.id, org_id: ORG_ID, full_name: u.name, role: u.role,
    });
    if (pErr) throw new Error(`profile ${u.email}: ${pErr.message}`);
  }
  console.log(`  ${USERS.length} staff accounts (one per role)`);

  // ── Masters ─────────────────────────────────────────────────────────────
  const { error: pErr } = await db.from("parties").insert(
    PARTIES.map((p) => ({
      id: p.id, org_id: ORG_ID, name: p.name,
      gstin: gstin(p.state, p.pan), state_code: p.state, phone: p.phone,
      addresses: [{ label: "Office", line1: "Replace with the real address", city: p.city, state_code: p.state, pincode: p.pin }],
      party_role: "both",
    })),
  );
  if (pErr) throw new Error(`parties: ${pErr.message}`);

  const { error: vErr } = await db.from("vehicles").insert(
    VEHICLES.map((v) => ({
      id: v.id, org_id: ORG_ID, reg_number: v.reg, vehicle_type: v.type,
      capacity_tons: v.cap, ownership: "own",
      rc_expiry: daysFromNow(v.fitness + 200),
      fitness_expiry: daysFromNow(v.fitness),
      insurance_expiry: daysFromNow(v.fitness + 40),
      permit_expiry: daysFromNow(v.fitness + 120),
      puc_expiry: daysFromNow(v.fitness + 15),
    })),
  );
  if (vErr) throw new Error(`vehicles: ${vErr.message}`);

  const { error: dErr } = await db.from("drivers").insert(
    DRIVERS.map((d) => ({
      id: d.id, org_id: ORG_ID, full_name: d.name, phone: d.phone,
      dl_number: d.dl, dl_expiry: daysFromNow(600), language: d.lang,
    })),
  );
  if (dErr) throw new Error(`drivers: ${dErr.message}`);

  console.log("  2 parties · 2 vehicles · 2 drivers");

  // ── Two consignments, at different points of the lifecycle ──────────────
  const consignor = PARTIES[0];
  const consignee = PARTIES[1];

  const address = (p: SampleParty) =>
    `Replace with the real address, ${p.city} ${p.pin}`;
  const snapshot = (p: SampleParty) => ({
    name: p.name, gstin: gstin(p.state, p.pan), state_code: p.state, address: address(p),
  });

  async function createConsignment(opts: {
    branchId: string; vehicleId: string; driverId: string;
    cargo: string; freight: number; loading: number;
    daysAgo: number; distanceKm: number; ewbHours: number;
  }) {
    const tax = computeTax({
      taxableValuePaise: toPaise(opts.freight + opts.loading),
      mode: "fcm_5",
      supplierStateCode: ORG_STATE,
      placeOfSupplyStateCode: consignee.state,
      exemptGoods: false,
    });

    const { data, error } = await db.from("consignments").insert({
      org_id: ORG_ID,
      branch_id: opts.branchId,
      lr_date: daysFromNow(-opts.daysAgo),
      consignor_party_id: consignor.id,
      consignor_snapshot: snapshot(consignor),
      consignee_party_id: consignee.id,
      consignee_snapshot: snapshot(consignee),
      origin_city: consignor.city,
      origin_state: consignor.state,
      destination_city: consignee.city,
      destination_state: consignee.state,
      distance_km: opts.distanceKm,
      cargo_description: opts.cargo,
      packages_count: 40,
      packages_unit: "bags",
      actual_weight_kg: 12_000,
      charged_weight_kg: 12_000,
      declared_value: 600_000,
      customer_invoice_no: "REPLACE-ME",
      customer_invoice_date: daysFromNow(-opts.daysAgo),
      ewb_no: "341200000001",
      ewb_valid_until: new Date(Date.now() + opts.ewbHours * 3_600_000).toISOString(),
      freight: opts.freight,
      loading: opts.loading,
      tax_mode: "fcm_5",
      tax_rate_pct: tax.ratePct,
      cgst_amount: fromPaise(tax.cgstPaise),
      sgst_amount: fromPaise(tax.sgstPaise),
      igst_amount: fromPaise(tax.igstPaise),
      invoice_total: fromPaise(tax.invoiceTotalPaise),
      tax_snapshot: {
        mode: "fcm_5", supplier_state: ORG_STATE, pos_state: consignee.state,
        exempt: false, rate_pct: tax.ratePct, reason: tax.reason, note: tax.note,
      },
      freight_terms: "to_be_billed",
      vehicle_id: opts.vehicleId,
      driver_id: opts.driverId,
    }).select("id, lr_no, tracking_token").single();

    if (error) throw new Error(`consignment: ${error.message}`);
    return data!;
  }

  /** Drives a transition through the same engine the application uses. */
  async function move(id: string, to: string, at: string, payload: Record<string, string | number> = {}) {
    const { error } = await db.rpc("_apply_transition", {
      p_consignment_id: id,
      p_to_status: to,
      p_payload: payload as never,
      p_event_time: at,
      p_actor_type: "system",
      p_actor_user_id: null as unknown as string,
    });
    if (error) throw new Error(`transition ${to}: ${error.message}`);
  }

  // 1 — on the road. Has a live driver link and a public tracking link.
  const inTransit = await createConsignment({
    branchId: BR_MAIN, vehicleId: VEHICLES[0].id, driverId: DRIVERS[0].id,
    cargo: "Sample cargo — replace", freight: 38_000, loading: 1500,
    daysAgo: 1, distanceKm: 350, ewbHours: 72,
  });
  await move(inTransit.id, "dispatched", hoursAgo(20), { advance: 10_000 });
  await move(inTransit.id, "in_transit", hoursAgo(6));

  await db.from("trip_expenses").insert([
    { org_id: ORG_ID, consignment_id: inTransit.id, kind: "diesel", amount: 8_640, litres: 90, paid_by: "driver", entered_by_type: "driver", spent_at: hoursAgo(5) },
    { org_id: ORG_ID, consignment_id: inTransit.id, kind: "toll",   amount: 1_250, paid_by: "driver", entered_by_type: "driver", spent_at: hoursAgo(4) },
  ]);

  // 2 — delivered and checked, so the billing flow can be used straight away.
  const verified = await createConsignment({
    branchId: BR_MAIN, vehicleId: VEHICLES[1].id, driverId: DRIVERS[1].id,
    cargo: "Sample cargo — replace", freight: 42_000, loading: 0,
    daysAgo: 4, distanceKm: 350, ewbHours: 240,
  });
  await move(verified.id, "dispatched", hoursAgo(80), { advance: 12_000 });
  await move(verified.id, "in_transit", hoursAgo(70));
  await move(verified.id, "delivered", hoursAgo(50), { force: "true" });

  const podClientId = crypto.randomUUID();
  const podPath = `${ORG_ID}/${verified.id}/${podClientId}.png`;
  const { error: upErr } = await db.storage
    .from("pods")
    .upload(podPath, placeholderPodPng(1), { contentType: "image/png", upsert: true });
  if (upErr) throw new Error(`pod upload: ${upErr.message}`);

  await db.from("consignment_pods").insert({
    org_id: ORG_ID, consignment_id: verified.id, page_no: 1,
    storage_path: podPath, client_id: podClientId,
    uploaded_by_type: "driver", uploaded_at: hoursAgo(48),
  });

  await move(verified.id, "pod_verified", hoursAgo(46));

  await db.from("trip_expenses").insert([
    { org_id: ORG_ID, consignment_id: verified.id, kind: "diesel", amount: 9_100, litres: 96, paid_by: "driver", entered_by_type: "driver", spent_at: hoursAgo(60) },
    { org_id: ORG_ID, consignment_id: verified.id, kind: "toll",   amount: 1_400, paid_by: "driver", entered_by_type: "driver", spent_at: hoursAgo(55) },
  ]);

  console.log("  2 lorry receipts (1 in transit · 1 ready to bill)");

  // No freight bills are seeded: raising the first one is the point.
  await summarise(inTransit, verified);
}

async function summarise(
  inTransit: { id: string; lr_no: string; tracking_token: string },
  verified: { lr_no: string },
) {
  const { data: token } = await db
    .from("access_tokens").select("token")
    .eq("consignment_id", inTransit.id).is("revoked_at", null).limit(1).single();

  console.log(`
─────────────────────────────────────────────────────────────
  Ready. Open http://localhost:3000/dashboard — no sign-in.
─────────────────────────────────────────────────────────────
  ${inTransit.lr_no}   in transit    driver + tracking links live
  ${verified.lr_no}   ready to bill  Freight bills → Generate bill

  Driver link     http://localhost:3000/d/${token?.token}
  Tracking link   http://localhost:3000/track/${inTransit.tracking_token}

  Everything above is sample data. Replace the two parties, two
  vehicles and two drivers with your own to clear it.
─────────────────────────────────────────────────────────────
`);
}

main().catch((err) => {
  console.error("\nSeed failed:", err.message);
  process.exit(1);
});
