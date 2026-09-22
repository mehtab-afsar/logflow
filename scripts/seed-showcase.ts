/**
 * Realistic data for screenshots, demos and the pitch deck.
 *
 * Separate from the starter seed on purpose: `npm run db:reset` must keep
 * giving two clearly-labelled samples, while this fills the same organisation
 * with a fortnight of believable Bengaluru trucking so the product can be
 * photographed and demonstrated.
 *
 * Replace ORG below with the client's real details before a live demo.
 *
 *   npm run db:seed:showcase
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/supabase";
import { gstinCheckDigit } from "../lib/india/validators";
import { computeTax } from "../lib/tax";
import { toPaise, fromPaise } from "../lib/money";
import { placeholderPodPng } from "./lib/placeholder-pod";

config({ path: ".env.local" });

const db: SupabaseClient<Database> = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** Swap these three for the client's real details before a live demo. */
const ORG = {
  name: "Shree Balaji Roadlines",
  pan: "AABCS1429B",
  lrPrefix: "SBR",
};

const gstin = (state: string, pan: string) => {
  const first14 = `${state}${pan}1Z`;
  return first14 + gstinCheckDigit(first14);
};

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const pick = <T,>(a: readonly T[], i: number) => a[i % a.length];

/** Real lanes out of Bengaluru, with plausible distances. */
const LANES = [
  { from: "Peenya, Bengaluru", to: "Sri City", state: "37", km: 320 },
  { from: "Bommasandra, Bengaluru", to: "Hyderabad", state: "36", km: 575 },
  { from: "Whitefield, Bengaluru", to: "Chennai", state: "33", km: 350 },
  { from: "Hosur", to: "Pune", state: "27", km: 840 },
  { from: "Nelamangala, Bengaluru", to: "Coimbatore", state: "33", km: 365 },
  { from: "Dabaspet, Bengaluru", to: "Vijayawada", state: "37", km: 690 },
] as const;

const CARGO = [
  { desc: "HDPE granules", unit: "bags", pkgs: 240, kg: 18_000 },
  { desc: "PVC pipes, 6m", unit: "bundles", pkgs: 84, kg: 12_400 },
  { desc: "TMT bars 12mm", unit: "bundles", pkgs: 40, kg: 24_000 },
  { desc: "Auto components", unit: "crates", pkgs: 120, kg: 9_600 },
  { desc: "Cement, 50kg", unit: "bags", pkgs: 500, kg: 25_000 },
  { desc: "Cotton bales", unit: "bales", pkgs: 96, kg: 15_200 },
  { desc: "Pharmaceutical cartons", unit: "cartons", pkgs: 310, kg: 6_800 },
  { desc: "Ceramic tiles", unit: "pallets", pkgs: 22, kg: 21_000 },
] as const;

const PARTIES = [
  { n: "Ashirvad Pipes Pvt Ltd", s: "29", p: "AAACA1234F", c: "Bengaluru", pin: "560058" },
  { n: "Apex Polymers Pvt Ltd", s: "29", p: "AABCA5678G", c: "Bengaluru", pin: "560058" },
  { n: "Karnataka Steels Ltd", s: "29", p: "AACCK9012H", c: "Bengaluru", pin: "560068" },
  { n: "Nandi Agro Foods", s: "29", p: "AAECN7890K", c: "Tumakuru", pin: "572101" },
  { n: "Mysore Polymers", s: "29", p: "AAZCM4567E", c: "Mysuru", pin: "570016" },
  { n: "Sri City Packaging LLP", s: "37", p: "AAGCS6789M", c: "Sri City", pin: "517646" },
  { n: "Guntur Chilli Traders", s: "37", p: "AATCG0123Y", c: "Guntur", pin: "522001" },
  { n: "Vijayawada Distributors", s: "37", p: "AASCV6789X", c: "Vijayawada", pin: "520010" },
  { n: "Sundaram Fasteners Ltd", s: "33", p: "AAFCS2345L", c: "Chennai", pin: "600032" },
  { n: "Coimbatore Pumps Ltd", s: "33", p: "AAUCC4567Z", c: "Coimbatore", pin: "641021" },
  { n: "Chennai Auto Components", s: "33", p: "AAHCC0123N", c: "Sriperumbudur", pin: "602105" },
  { n: "Hyderabad Pharma Supplies", s: "36", p: "AAQCH8901V", c: "Hyderabad", pin: "500032" },
  { n: "Telangana Cement Corp", s: "36", p: "AARCT2345W", c: "Nalgonda", pin: "508001" },
  { n: "Warangal Rice Mills", s: "36", p: "AAYCW0123D", c: "Warangal", pin: "506002" },
  { n: "Jain Irrigation Systems", s: "27", p: "AAJCJ4567P", c: "Jalgaon", pin: "425001" },
  { n: "Pune Engineering Works", s: "27", p: "AAKCP8901Q", c: "Pune", pin: "411018" },
  { n: "Nashik Wine Growers", s: "27", p: "AAWCN2345B", c: "Nashik", pin: "422003" },
  { n: "Bhiwandi Textile Mills", s: "27", p: "AALCM2345R", c: "Bhiwandi", pin: "421302" },
  { n: "Havells India Ltd", s: "24", p: "AAMCH6789S", c: "Vadodara", pin: "390010" },
  { n: "Rajkot Bearings Pvt Ltd", s: "24", p: "AAXCR6789C", c: "Rajkot", pin: "360002" },
  { n: "Surat Fabrics Pvt Ltd", s: "24", p: "AAPCS4567U", c: "Surat", pin: "395003" },
  { n: "Amul Dairy Federation", s: "24", p: "AANCA0123T", c: "Anand", pin: "388001" },
  { n: "Madurai Cotton Mills", s: "33", p: "AAVCM8901A", c: "Madurai", pin: "625016" },
  { n: "Vizag Marine Exports", s: "37", p: "AASCV1111X", c: "Visakhapatnam", pin: "530012" },
  { n: "Tirupati Logistics Hub", s: "37", p: "ABACT8901F", c: "Tirupati", pin: "517501" },
] as const;

const VEHICLES = [
  { r: "KA-01-AB-4471", t: "32ft MXL", cap: 21, own: "own", fit: 210 },
  { r: "KA-02-CD-7788", t: "32ft SXL", cap: 18, own: "own", fit: 320 },
  { r: "KA-03-EF-1129", t: "32ft MXL", cap: 21, own: "own", fit: 6 },
  { r: "KA-04-GH-3356", t: "20ft", cap: 9, own: "own", fit: 25 },
  { r: "KA-05-JK-9012", t: "32ft SXL", cap: 18, own: "own", fit: 400 },
  { r: "KA-06-LM-5567", t: "Open 19ft", cap: 7, own: "own", fit: 155 },
  { r: "KA-07-NP-2234", t: "32ft MXL", cap: 21, own: "own", fit: 275 },
  { r: "KA-08-QR-8890", t: "20ft", cap: 9, own: "own", fit: 480 },
  { r: "KA-09-ST-4412", t: "Trailer 40ft", cap: 25, own: "own", fit: 190 },
  { r: "TN-10-UV-6678", t: "32ft SXL", cap: 18, own: "attached", fit: 240 },
  { r: "MH-11-WX-1123", t: "32ft MXL", cap: 21, own: "attached", fit: 130 },
  { r: "AP-12-YZ-7745", t: "Trailer 40ft", cap: 25, own: "attached", fit: 345 },
] as const;

const DRIVERS = [
  { n: "Ramesh Kumar", p: "9845012301", l: "hi" },
  { n: "Suresh Naik", p: "9845012302", l: "kn" },
  { n: "Manjunath S", p: "9845012303", l: "kn" },
  { n: "Pravin Sharma", p: "9845012304", l: "hi" },
  { n: "Iqbal Ahmed", p: "9845012305", l: "hi" },
  { n: "Lakshman Rao", p: "9845012306", l: "kn" },
  { n: "Gopal Yadav", p: "9845012307", l: "hi" },
  { n: "Vinod Patil", p: "9845012308", l: "en" },
] as const;

async function main() {
  console.log("Seeding showcase data…\n");

  const { data: org } = await db
    .from("organisations").select("id").eq("legal_name", "Sample Transport Co").maybeSingle();
  if (!org) throw new Error("Run `npm run db:reset` first — the starter org is missing.");

  const orgId = org.id;

  // Become a real transporter, on reverse charge like most small fleets.
  await db.from("organisations").update({
    legal_name: ORG.name,
    gstin: gstin("29", ORG.pan),
    pan: ORG.pan,
    address: "Plot 47, 2nd Stage, Peenya Industrial Area, Bengaluru 560058",
    tax_mode: "rcm",
    bank_details: { bank: "Canara Bank", branch: "Peenya", account: "0472201004512", ifsc: "CNRB0000472" },
  }).eq("id", orgId);

  const { data: branches } = await db.from("branches").select("id, lr_prefix").eq("org_id", orgId).order("name");
  const branch = branches![0];
  await db.from("branches").update({ name: "Peenya (HQ)", lr_prefix: ORG.lrPrefix }).eq("id", branch.id);

  // Clear the two starter samples so the showcase is not mixed with them.
  await db.from("freight_bills").delete().eq("org_id", orgId);
  await db.from("consignments").delete().eq("org_id", orgId);
  await db.from("parties").delete().eq("org_id", orgId);
  await db.from("vehicles").delete().eq("org_id", orgId);
  await db.from("drivers").delete().eq("org_id", orgId);

  const { data: parties } = await db.from("parties").insert(
    PARTIES.map((p, i) => ({
      org_id: orgId, name: p.n, gstin: gstin(p.s, p.p), state_code: p.s,
      phone: `98${String(45020000 + i).padStart(8, "0")}`,
      addresses: [{ label: "Works", line1: `${p.c} Industrial Area`, city: p.c, state_code: p.s, pincode: p.pin }],
      party_role: "both",
    })),
  ).select("id, name, gstin, state_code, addresses");

  const { data: vehicles } = await db.from("vehicles").insert(
    VEHICLES.map((v) => ({
      org_id: orgId, reg_number: v.r, vehicle_type: v.t, capacity_tons: v.cap, ownership: v.own,
      fitness_expiry: daysAgo(-v.fit), insurance_expiry: daysAgo(-(v.fit + 40)),
      permit_expiry: daysAgo(-(v.fit + 120)), puc_expiry: daysAgo(-(v.fit + 15)),
      rc_expiry: daysAgo(-(v.fit + 300)),
    })),
  ).select("id, reg_number");

  const { data: drivers } = await db.from("drivers").insert(
    DRIVERS.map((d, i) => ({
      org_id: orgId, full_name: d.n, phone: d.p, language: d.l,
      dl_number: `KA${String(1 + i).padStart(2, "0")}20${18 + (i % 5)}000${1000 + i}`,
      dl_expiry: daysAgo(-500),
    })),
  ).select("id, full_name");

  console.log(`  ${parties!.length} parties · ${vehicles!.length} vehicles · ${drivers!.length} drivers`);

  const blr = parties!.filter((p) => p.state_code === "29");
  const out = parties!.filter((p) => p.state_code !== "29");

  const PLAN: { status: string; n: number }[] = [
    { status: "draft", n: 3 },
    { status: "dispatched", n: 6 },
    { status: "in_transit", n: 9 },
    { status: "delivered", n: 7 },
    { status: "pod_verified", n: 6 },
    { status: "invoiced", n: 6 },
    { status: "settled", n: 2 },
    { status: "cancelled", n: 1 },
  ];

  const made: { id: string; lr: string; status: string; token: string }[] = [];
  let i = 0;

  for (const { status, n } of PLAN) {
    for (let k = 0; k < n; k += 1, i += 1) {
      const lane = pick(LANES, i);
      const cargo = pick(CARGO, i);
      // Every POD-verified LR shares one consignor, so the batch-bill demo is
      // a single "select all".
      const consignor = status === "pod_verified" ? blr[0] : pick(blr, i);
      const consignee = out.find((p) => p.state_code === lane.state) ?? pick(out, i);
      const vehicle = pick(vehicles!, i);
      const driver = pick(drivers!, i);

      const freight = 28_000 + ((i * 3700) % 37_000);
      const loading = i % 3 === 0 ? 1_800 : 0;
      const unloading = i % 4 === 0 ? 1_500 : 0;

      const tax = computeTax({
        taxableValuePaise: toPaise(freight + loading + unloading),
        mode: "rcm", supplierStateCode: "29",
        placeOfSupplyStateCode: consignee.state_code!, exemptGoods: false,
      });

      const addr = (p: typeof consignor) => {
        const a = (p.addresses as { line1: string; city: string; pincode: string }[])[0];
        return `${a.line1}, ${a.city} ${a.pincode}`;
      };

      const { data: row, error } = await db.from("consignments").insert({
        org_id: orgId, branch_id: branch.id,
        lr_date: daysAgo(21 - Math.floor(i * 0.5)),
        consignor_party_id: consignor.id,
        consignor_snapshot: { name: consignor.name, gstin: consignor.gstin, state_code: consignor.state_code, address: addr(consignor) },
        consignee_party_id: consignee.id,
        consignee_snapshot: { name: consignee.name, gstin: consignee.gstin, state_code: consignee.state_code, address: addr(consignee) },
        origin_city: lane.from, origin_state: "29",
        destination_city: lane.to, destination_state: consignee.state_code!,
        distance_km: lane.km,
        cargo_description: cargo.desc, packages_count: cargo.pkgs, packages_unit: cargo.unit,
        actual_weight_kg: cargo.kg, charged_weight_kg: cargo.kg,
        declared_value: 400_000 + ((i * 61_000) % 1_100_000),
        customer_invoice_no: `INV/${2026}/${4100 + i}`,
        customer_invoice_date: daysAgo(21 - Math.floor(i * 0.5)),
        ewb_no: String(341200000000 + i * 917).slice(0, 12),
        ewb_valid_until: new Date(Date.now() + (status === "in_transit" && k === 0 ? 8 : 96) * 3_600_000).toISOString(),
        freight, loading, unloading,
        tax_mode: "rcm", tax_rate_pct: tax.ratePct,
        cgst_amount: fromPaise(tax.cgstPaise), sgst_amount: fromPaise(tax.sgstPaise),
        igst_amount: fromPaise(tax.igstPaise), invoice_total: fromPaise(tax.invoiceTotalPaise),
        tax_snapshot: { mode: "rcm", supplier_state: "29", pos_state: consignee.state_code, exempt: false, rate_pct: 0, reason: tax.reason, note: tax.note },
        freight_terms: i % 3 === 0 ? "to_pay" : "to_be_billed",
        advance_received: i % 4 === 0 ? 10_000 : 0,
        vehicle_id: status === "draft" && k === 0 ? null : vehicle.id,
        driver_id: status === "draft" && k === 0 ? null : driver.id,
        eta_text: status === "in_transit" ? "Expected tomorrow evening" : null,
      }).select("id, lr_no, tracking_token").single();

      if (error) throw new Error(`consignment ${i}: ${error.message}`);
      made.push({ id: row!.id, lr: row!.lr_no, status, token: row!.tracking_token });
    }
  }
  console.log(`  ${made.length} lorry receipts`);

  const move = async (id: string, to: string, at: string, payload: Record<string, string | number> = {}) => {
    const { error } = await db.rpc("_apply_transition", {
      p_consignment_id: id, p_to_status: to, p_payload: payload as never,
      p_event_time: at, p_actor_type: "system", p_actor_user_id: null as unknown as string,
    });
    if (error) throw new Error(`${to}: ${error.message}`);
  };

  let stale = 0, unverified = 0, podSeed = 0;

  for (const c of made) {
    if (c.status === "draft") continue;

    const age = c.status === "dispatched" ? 5 + (podSeed % 10) : 34 + (podSeed % 40);
    await move(c.id, "dispatched", hoursAgo(age), { advance: 10_000 });

    if (c.status === "cancelled") {
      await move(c.id, "cancelled", hoursAgo(age - 2), { reason: "Customer cancelled — vehicle already loaded" });
      continue;
    }
    if (c.status === "dispatched") continue;

    // Exactly three in-transit trips go quiet for over a day.
    const quiet = c.status === "in_transit" && stale < 3;
    await move(c.id, "in_transit", quiet ? hoursAgo(29 + stale) : hoursAgo(3 + (podSeed % 14)));
    if (quiet) stale += 1;

    const litres = 70 + (podSeed % 55);
    await db.from("trip_expenses").insert([
      { org_id: orgId, consignment_id: c.id, kind: "diesel", amount: Math.round(litres * 94.2), litres, paid_by: "driver", entered_by_type: "driver", spent_at: hoursAgo(age - 6) },
      { org_id: orgId, consignment_id: c.id, kind: "toll", amount: 880 + ((podSeed * 137) % 1500), paid_by: "driver", entered_by_type: "driver", spent_at: hoursAgo(age - 9) },
    ]);

    if (c.status === "in_transit") continue;

    await move(c.id, "delivered", hoursAgo(age - 16), { force: "true" });

    // Four PODs sit unverified for over a day, so the exceptions panel is real.
    const uploadedAgo = c.status === "delivered" && unverified < 4 ? 30 : 5;
    const clientId = crypto.randomUUID();
    const path = `${orgId}/${c.id}/${clientId}.png`;
    await db.storage.from("pods").upload(path, placeholderPodPng(podSeed++), { contentType: "image/png", upsert: true });
    await db.from("consignment_pods").insert({
      org_id: orgId, consignment_id: c.id, page_no: 1, storage_path: path,
      client_id: clientId, uploaded_by_type: "driver", uploaded_at: hoursAgo(uploadedAgo),
    });
    if (c.status === "delivered") { unverified += 1; continue; }

    await move(c.id, "pod_verified", hoursAgo(age - 20));
  }
  console.log("  event trails, driver expenses and PODs");

  // Bills for the invoiced and settled ones.
  const billable = made.filter((c) => c.status === "invoiced" || c.status === "settled");
  const groups = new Map<string, string[]>();
  for (const c of billable) {
    const { data } = await db.from("consignments").select("consignor_party_id").eq("id", c.id).single();
    const key = data!.consignor_party_id!;
    groups.set(key, [...(groups.get(key) ?? []), c.id]);
  }

  let bills = 0;
  for (const [partyId, ids] of groups) {
    const { data: rows } = await db.from("consignments").select("taxable_value, consignee_snapshot").in("id", ids);
    const total = (rows ?? []).reduce((s, r) => s + Number(r.taxable_value ?? 0), 0);
    const pos = ((rows?.[0]?.consignee_snapshot ?? {}) as { state_code?: string }).state_code ?? "29";
    const tax = computeTax({ taxableValuePaise: toPaise(total), mode: "rcm", supplierStateCode: "29", placeOfSupplyStateCode: pos, exemptGoods: false });

    const { data: no } = await db.rpc("next_doc_number", { p_branch_id: branch.id, p_doc_type: "INV", p_date: daysAgo(2) });
    const { data: party } = await db.from("parties").select("name, gstin, state_code, addresses").eq("id", partyId).single();

    const { data: bill } = await db.from("freight_bills").insert({
      org_id: orgId, branch_id: branch.id, bill_no: no!, bill_date: daysAgo(2),
      party_id: partyId, party_snapshot: party ?? {},
      taxable_value: total, tax_mode: "rcm", tax_rate_pct: 0,
      cgst_amount: 0, sgst_amount: 0, igst_amount: 0,
      total_amount: fromPaise(tax.invoiceTotalPaise),
      tax_snapshot: { mode: "rcm", reason: tax.reason, note: tax.note },
    }).select("id").single();

    for (const cid of ids) {
      const { data: line } = await db.from("consignments").select("taxable_value").eq("id", cid).single();
      await db.from("bill_lines").insert({ bill_id: bill!.id, consignment_id: cid, amount: Number(line?.taxable_value ?? 0) });
      await db.from("consignments").update({ bill_id: bill!.id }).eq("id", cid);
      await move(cid, "invoiced", hoursAgo(20));
    }
    bills += 1;
  }
  for (const c of made.filter((x) => x.status === "settled")) await move(c.id, "settled", hoursAgo(4));
  console.log(`  ${bills} freight bills`);

  const draft = made.find((c) => c.status === "draft");
  const live = made.find((c) => c.status === "dispatched");
  const { data: tok } = await db.from("access_tokens").select("token").eq("consignment_id", live!.id).limit(1).single();
  const track = made.find((c) => c.status === "in_transit");

  console.log(`
─────────────────────────────────────────────────────────────
  ${ORG.name} — ready to demo
─────────────────────────────────────────────────────────────
  Dashboard      http://localhost:3000/dashboard
  Driver link    http://localhost:3000/d/${tok!.token}
  Tracking link  http://localhost:3000/track/${track!.token}

  Dispatch live in the demo:  ${draft!.lr}
─────────────────────────────────────────────────────────────
`);
}

main().catch((e) => { console.error("\nShowcase seed failed:", e.message); process.exit(1); });
