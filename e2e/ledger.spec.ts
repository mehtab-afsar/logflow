import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";
import { admin, makeTrip, testOrg } from "./fixtures/data";

/**
 * The payment ledger (migration 20260915000003) — the "5 of 10 bills paid,
 * 5 outstanding" scenario, answered live from ledger_entries rather than
 * stored as a running balance.
 */
test.describe("payment ledger", () => {
  test("a bill creates a receivable, and the Payments page tracks it down to zero", async ({ page }) => {
    const trip = await makeTrip("pod_verified");
    await signIn(page, "accounts");

    // trip.consignorPartyId is shared with other specs that also bill it
    // (makeTrip()'s default consignor, picked alphabetically) — capture the
    // baseline BEFORE this test adds anything, and assert on the DELTA this
    // test's own bill/payments make from here, so this doesn't depend on
    // run order or what else billed this same party first.
    const before = await page.request.get(`/api/parties/${trip.consignorPartyId}/outstanding`);
    const baseline = (await before.json()).data.outstanding ?? 0;

    const billRes = await page.request.post("/api/bills", {
      data: {
        branch_id: trip.branchId,
        consignor_party_id: trip.consignorPartyId,
        consignment_ids: [trip.id],
      },
    });
    expect(billRes.status(), await billRes.text()).toBe(201);
    const billId = (await billRes.json()).data.bill_id as string;

    const { data: bill } = await admin
      .from("freight_bills").select("total_amount").eq("id", billId).single();
    const total = Number(bill!.total_amount);

    const afterBill = await page.request.get(`/api/parties/${trip.consignorPartyId}/outstanding`);
    expect((await afterBill.json()).data.outstanding).toBeCloseTo(baseline + total, 2);

    await page.goto("/payments");
    await expect(page.getByText(/owed to us/).first()).toBeVisible({ timeout: 10_000 });

    const half = Math.floor(total / 2);
    const partial = await page.request.post("/api/ledger/payments", {
      data: {
        counterparty_type: "consignor", party_id: trip.consignorPartyId,
        ref_type: "bill", ref_id: billId, amount: half,
        payment_mode: "upi",
      },
    });
    expect(partial.status(), await partial.text()).toBe(201);

    const mid = await page.request.get(`/api/parties/${trip.consignorPartyId}/outstanding`);
    const midOutstanding = (await mid.json()).data.outstanding;
    expect(midOutstanding).toBeCloseTo(baseline + total - half, 2);

    const full = await page.request.post("/api/ledger/payments", {
      data: {
        counterparty_type: "consignor", party_id: trip.consignorPartyId,
        ref_type: "bill", ref_id: billId, amount: total - half,
        payment_mode: "bank_transfer", reference_no: "UTR999",
      },
    });
    expect(full.status(), await full.text()).toBe(201);

    const after = await page.request.get(`/api/parties/${trip.consignorPartyId}/outstanding`);
    expect((await after.json()).data.outstanding).toBeCloseTo(baseline, 2);

    // The office timeline picks it up without a ledger join.
    const { data: events } = await admin
      .from("consignment_events").select("kind").eq("consignment_id", trip.id).eq("kind", "payment_recorded");
    expect(events).toHaveLength(2);
  });

  test("a vendor charge is only accepted against the vendor that actually owns the vehicle", async ({ page }) => {
    const o = await testOrg();
    await signIn(page, "owner");

    // Two vendor parties; only one owns the vehicle used on this trip.
    const trip = await makeTrip("dispatched");
    const realOwnerId = o.partyIds[2];
    const impostorId = o.partyIds[3];

    const { data: consignment } = await admin
      .from("consignments").select("vehicle_id").eq("id", trip.id).single();
    await admin.from("vehicles").update({ ownership: "attached", owner_party_id: realOwnerId })
      .eq("id", consignment!.vehicle_id);

    const wrong = await page.request.post("/api/ledger/vendor-charges", {
      data: { vendor_party_id: impostorId, consignment_id: trip.id, amount: 12000 },
    });
    expect(wrong.status()).toBe(404);

    const beforeRes = await page.request.get(`/api/parties/${realOwnerId}/outstanding`);
    const baseline = (await beforeRes.json()).data.outstanding ?? 0;

    const right = await page.request.post("/api/ledger/vendor-charges", {
      data: { vendor_party_id: realOwnerId, consignment_id: trip.id, amount: 12000, notes: "hire charge" },
    });
    expect(right.status(), await right.text()).toBe(201);

    const outstanding = await page.request.get(`/api/parties/${realOwnerId}/outstanding`);
    const json = await outstanding.json();
    expect(json.data.outstanding).toBeCloseTo(baseline + 12000, 2);
    expect(json.data.direction).toBe("payable");

    await admin.from("vehicles").update({ ownership: "own", owner_party_id: null })
      .eq("id", consignment!.vehicle_id);
  });

  test("a viewer cannot record a payment or a vendor charge", async ({ page }) => {
    const o = await testOrg();
    await signIn(page, "viewer");

    const payRes = await page.request.post("/api/ledger/payments", {
      data: {
        counterparty_type: "consignor", party_id: o.partyIds[0], ref_type: "advance",
        amount: 1000, payment_mode: "cash",
      },
    });
    expect(payRes.status()).toBe(403);

    const chargeRes = await page.request.post("/api/ledger/vendor-charges", {
      data: { vendor_party_id: o.partyIds[0], consignment_id: o.partyIds[0], amount: 1000 },
    });
    expect(chargeRes.status()).toBe(403);
  });
});
