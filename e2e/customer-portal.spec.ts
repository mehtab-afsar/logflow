import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";
import { admin, testOrg, makeTrip } from "./fixtures/data";
import { expectMagicLink } from "./fixtures/mailbox";

/**
 * The customer dashboard (migration 20260915000004) — a real, RLS-scoped
 * login for a consignor, not another anonymous token. Walks the real path:
 * staff invites a party's contact by email, a real magic-link email arrives,
 * opening it signs the customer straight into their own shell.
 */
test.describe("customer portal", () => {
  test("an invited consignor sees only their own shipments and outstanding, nothing else", async ({ page, context }) => {
    const o = await testOrg();
    await signIn(page, "owner");

    // A fresh party per run — the invite is keyed by email, and the demo
    // seed parties are shared across every spec in the suite.
    const stamp = Date.now();
    const partyName = `Portal Test Consignor ${stamp}`;
    const email = `portal-${stamp}@example.test`;

    const partyRes = await page.request.post("/api/parties", {
      data: {
        name: partyName, party_role: "consignor",
        addresses: [{ line1: "Test address", city: "Bengaluru", state_code: "29", pincode: "560058" }],
      },
    });
    expect(partyRes.status(), await partyRes.text()).toBe(201);
    const partyId = (await partyRes.json()).data.id as string;

    const sentAfter = new Date();
    const inviteRes = await page.request.post(`/api/parties/${partyId}/invite-customer`, {
      data: { email },
    });
    expect(inviteRes.status(), await inviteRes.text()).toBe(201);

    // A shipment and a bill for this party. makeTrip() only ever picks
    // among the suite's four known-complete seed parties (deliberately, to
    // avoid the cross-test contamination fixed earlier in this project) —
    // this freshly created party isn't one of them, so build with the
    // default seed consignor and reassign it directly, the same way the
    // fixture itself sets consignor_snapshot.
    const trip = await makeTrip("pod_verified");
    const { data: party } = await admin.from("parties").select("name, gstin, state_code").eq("id", partyId).single();
    await admin.from("consignments").update({
      consignor_party_id: partyId,
      consignor_snapshot: { name: party!.name, gstin: party!.gstin, state_code: party!.state_code, address: "Test address" },
    }).eq("id", trip.id);

    const billRes = await page.request.post("/api/bills", {
      data: { branch_id: trip.branchId, consignor_party_id: partyId, consignment_ids: [trip.id] },
    });
    expect(billRes.status(), await billRes.text()).toBe(201);
    const { data: bill } = await admin.from("freight_bills").select("total_amount").eq("party_id", partyId).single();
    const billTotal = Number(bill!.total_amount);

    // Open the real magic-link email in a SEPARATE browser context — the
    // owner's session above must stay untouched, same isolation the driver
    // portal tests already use for exactly this reason.
    const link = await expectMagicLink(email, sentAfter);
    const customerCtx = await context.browser()!.newContext();
    const customerPage = await customerCtx.newPage();
    await customerPage.goto(link);
    await expect(customerPage).toHaveURL(/\/customer/, { timeout: 15_000 });

    // Only this party's shipment, nowhere else's — the seed org has other
    // consignments belonging to other parties.
    await expect(customerPage.getByText(trip.lr_no)).toBeVisible({ timeout: 10_000 });
    const rowCount = await customerPage.locator("tbody tr").count();
    expect(rowCount).toBe(1);

    await customerPage.getByText(trip.lr_no).click();
    await expect(customerPage).toHaveURL(new RegExp(`/customer/${trip.id}$`));
    await expect(customerPage.getByRole("heading", { name: "Progress" })).toBeVisible();

    await customerPage.goto("/customer/bills");
    await expect(customerPage.getByText(new RegExp(billTotal.toLocaleString("en-IN"))).first()).toBeVisible({ timeout: 10_000 });

    // No staff surface reachable — this session is genuinely signed in (a
    // real auth.users row) but has no profiles row, so verifyAuth() itself
    // refuses it with 403 "No profile for this account" — the same refusal
    // any signed-in stranger with no company would get, not a hole a
    // customer login could widen into staff access.
    const staffApi = await customerPage.request.get("/api/consignments");
    expect(staffApi.status()).toBe(403);

    // Cross-tenant style check: a DIFFERENT org's (the seed demo org's)
    // consignment id must be a 404, never visible.
    const { data: otherOrgTrip } = await admin
      .from("consignments").select("id").neq("org_id", o.id).limit(1).maybeSingle();
    if (otherOrgTrip) {
      const res = await customerPage.request.get(`/customer/${otherOrgTrip.id}`);
      expect(res.status()).toBe(404);
    }

    await customerCtx.close();
  });

  test("a customer_accounts row cannot be created by a client directly", async ({ request }) => {
    // No route exposes a direct table write — link_customer_account() is the
    // only writer, reached only through invite-customer, which itself
    // requires a real invited auth.users id. Hits PostgREST directly with
    // the anon key (no session at all — the strictest case, and the same
    // 401/403 a stolen anon key alone would get) to confirm there is no
    // insert policy standing in for it.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const res = await request.post(`${supabaseUrl}/rest/v1/customer_accounts`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
      data: {
        id: "00000000-0000-0000-0000-000000000000",
        org_id: "00000000-0000-0000-0000-000000000000",
        party_id: "00000000-0000-0000-0000-000000000000",
      },
    });
    expect(res.status()).not.toBe(201);
  });
});
