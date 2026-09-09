import { createClient } from "@supabase/supabase-js";
import { placeholderPodPng } from "../../scripts/lib/placeholder-pod";
import { gstinCheckDigit } from "../../lib/india/validators";

/**
 * The end-to-end suite runs in its OWN organisation.
 *
 * WHY: the suite writes into the same local database the developer looks at,
 * and it leaves behind roughly thirteen consignments per run plus generated
 * parties, vehicles and drivers. Reseeding fixes it until the next run.
 *
 * Giving the suite its own tenant makes RLS do the cleaning: every row a test
 * creates belongs to an organisation the demo session cannot see, so
 * `npm run db:reset` leaves exactly two of everything and running the tests
 * never changes what is on screen. It also means the tenancy boundary is
 * exercised on every run rather than bypassed.
 *
 * The corollary is that tests must sign in as THIS org's users, not the demo
 * org's — see signIn() in ./auth.
 */
export const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

export const TEST_ORG_NAME = "E2E Test Transport";
export const TEST_PASSWORD = "logiflow123";

export const TEST_USERS = {
  owner: "owner@e2e.test",
  dispatcher: "dispatch@e2e.test",
  accounts: "accounts@e2e.test",
  viewer: "viewer@e2e.test",
} as const;

export type TestRole = keyof typeof TEST_USERS;

interface TestOrg {
  id: string;
  stateCode: string;
  branchId: string;
  partyIds: string[];
  vehicleId: string;
  driverId: string;
}

function gstin(stateCode: string, pan: string): string {
  const first14 = `${stateCode}${pan}1Z`;
  return first14 + gstinCheckDigit(first14);
}

/** Built once per run and reused; safe to call from any test. */
let cached: Promise<TestOrg> | null = null;

export function testOrg(): Promise<TestOrg> {
  cached ??= build();
  return cached;
}

async function build(): Promise<TestOrg> {
  const existing = await admin
    .from("organisations").select("id, state_code")
    .eq("legal_name", TEST_ORG_NAME).maybeSingle();

  const orgId = existing.data?.id ?? (await createOrg());
  const stateCode = existing.data?.state_code ?? "29";

  const branchId = await ensureBranch(orgId);
  await ensureUsers(orgId);
  const partyIds = await ensureParties(orgId);
  const { vehicleId, driverId } = await ensureFleet(orgId);

  return { id: orgId, stateCode, branchId, partyIds, vehicleId, driverId };
}

async function createOrg(): Promise<string> {
  const { data, error } = await admin.from("organisations").insert({
    legal_name: TEST_ORG_NAME,
    gstin: gstin("29", "AAECT4321F"),
    state_code: "29",
    address: "End-to-end test fixtures",
    tax_mode: "fcm_5",
  }).select("id").single();
  if (error) throw new Error(`test org: ${error.message}`);
  return data.id;
}

async function ensureBranch(orgId: string): Promise<string> {
  const found = await admin
    .from("branches").select("id").eq("org_id", orgId).limit(1).maybeSingle();
  if (found.data) return found.data.id;

  const { data, error } = await admin.from("branches").insert({
    org_id: orgId, name: "Test Branch", city: "Bengaluru", state_code: "29",
    // Prefixes are unique per organisation, so these cannot collide with the
    // demo org's LF/INV.
    lr_prefix: "ET", inv_prefix: "ETI",
  }).select("id").single();
  if (error) throw new Error(`test branch: ${error.message}`);
  return data.id;
}

async function ensureUsers(orgId: string): Promise<void> {
  for (const [role, email] of Object.entries(TEST_USERS)) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email, password: TEST_PASSWORD, email_confirm: true,
      user_metadata: { full_name: `Test ${role}` },
    });

    // Already there from an earlier run — nothing to do.
    if (error) continue;
    if (!created.user) continue;

    await admin.from("profiles").insert({
      id: created.user.id, org_id: orgId, full_name: `Test ${role}`, role,
    });
  }
}

async function ensureParties(orgId: string): Promise<string[]> {
  const found = await admin
    .from("parties").select("id").eq("org_id", orgId).is("deleted_at", null).order("name");
  if ((found.data?.length ?? 0) >= 4) return found.data!.map((p) => p.id);

  const seeds = [
    { name: "Test Consignor A", state: "29", pan: "AAACA1111A", city: "Bengaluru" },
    { name: "Test Consignee B", state: "33", pan: "AAACB2222B", city: "Chennai" },
    { name: "Test Party C", state: "27", pan: "AAACC3333C", city: "Pune" },
    { name: "Test Party D", state: "24", pan: "AAACD4444D", city: "Surat" },
  ];

  const { data, error } = await admin.from("parties").insert(
    seeds.map((p) => ({
      org_id: orgId, name: p.name, gstin: gstin(p.state, p.pan),
      state_code: p.state, phone: "9800000001",
      addresses: [{ label: "Office", line1: "Test address", city: p.city, state_code: p.state, pincode: "560058" }],
      party_role: "both",
    })),
  ).select("id");
  if (error) throw new Error(`test parties: ${error.message}`);
  return data.map((p) => p.id);
}

async function ensureFleet(orgId: string): Promise<{ vehicleId: string; driverId: string }> {
  const v = await admin
    .from("vehicles").select("id").eq("org_id", orgId).is("deleted_at", null).limit(1).maybeSingle();
  const d = await admin
    .from("drivers").select("id").eq("org_id", orgId).is("deleted_at", null).limit(1).maybeSingle();

  // A near-term expiry so the fleet page's urgency badge has something true to
  // show; without it the "documents expiring" assertions have no signal.
  const soon = new Date();
  soon.setDate(soon.getDate() + 12);

  const vehicleId = v.data?.id ?? (await admin.from("vehicles").insert({
    org_id: orgId, reg_number: "KA-99-TE-0001", vehicle_type: "32ft SXL",
    capacity_tons: 18, ownership: "own",
    fitness_expiry: soon.toISOString().slice(0, 10),
    insurance_expiry: soon.toISOString().slice(0, 10),
  }).select("id").single()).data!.id;

  const driverId = d.data?.id ?? (await admin.from("drivers").insert({
    // Not "Test Driver": the tracking page renders a field LABEL reading
    // "Driver", so a surname of "Driver" makes the "surname is withheld"
    // assertion collide with the label rather than with leaked data.
    org_id: orgId, full_name: "Ravi Kulkarni", phone: "9800000099", language: "en",
  }).select("id").single()).data!.id;

  return { vehicleId, driverId };
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
 * Creates a consignment in the test organisation and walks it to `upTo` using
 * the same engine the app uses, so preconditions and event-writing are
 * exercised rather than bypassed.
 */
export async function makeTrip(
  upTo: "draft" | "dispatched" | "in_transit" | "delivered" | "pod_verified" = "dispatched",
  opts: { consignorId?: string } = {},
): Promise<FreshTrip> {
  const o = await testOrg();

  const { data: parties } = await admin
    .from("parties").select("id, name, gstin, state_code")
    .eq("org_id", o.id).is("deleted_at", null).order("name");

  const consignor = opts.consignorId
    ? parties!.find((p) => p.id === opts.consignorId)!
    : parties![0];
  const consignee = parties!.find((p) => p.id !== consignor.id)!;

  const snap = (p: typeof consignor) => ({
    name: p.name, gstin: p.gstin, state_code: p.state_code, address: "Test address",
  });

  const intra = consignee.state_code === o.stateCode;

  const { data: c, error } = await admin.from("consignments").insert({
    org_id: o.id,
    branch_id: o.branchId,
    consignor_party_id: consignor.id,
    consignor_snapshot: snap(consignor),
    consignee_party_id: consignee.id,
    consignee_snapshot: snap(consignee),
    origin_city: "Bengaluru",
    origin_state: o.stateCode,
    destination_city: "Test City",
    destination_state: consignee.state_code!,
    cargo_description: "E2E test cargo",
    freight: 10_000,
    tax_mode: "fcm_5",
    tax_rate_pct: 5,
    igst_amount: intra ? 0 : 500,
    cgst_amount: intra ? 250 : 0,
    sgst_amount: intra ? 250 : 0,
    invoice_total: 10_500,
    tax_snapshot: { mode: "fcm_5", reason: intra ? "intra_state" : "inter_state", rate_pct: 5 },
    vehicle_id: o.vehicleId,
    driver_id: o.driverId,
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
    branchId: o.branchId,
  };
}
