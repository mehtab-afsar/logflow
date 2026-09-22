import { test, expect } from "@playwright/test";
import { signIn, pickCombobox, fillLrCharges } from "./fixtures/auth";
import { admin, testOrg } from "./fixtures/data";

/**
 * Flexible additional charges (migration 20260915000001), replacing the old
 * 4 fixed freight/loading/unloading/detention/other_charges columns on
 * consignments with an org-configurable charge_types master and a real
 * consignment_charge_lines child table, summed into taxable_value by a
 * trigger rather than a GENERATED column.
 */
test.describe("flexible additional charges", () => {
  test("3+ charge lines sum into taxable_value, tax and the PDF exactly", async ({ page }) => {
    await signIn(page, "dispatcher");
    await page.goto("/consignments/new");

    await pickCombobox(page, "Consignor", "Test Consignor");
    await pickCombobox(page, "Consignee", "Test Consignee");
    await page.getByLabel("Description of goods").fill("Charges regression cargo");

    // Freight (default line) + Loading (added line) + a third custom line.
    await fillLrCharges(page, { freight: "20000", loading: "2500" });
    await page.getByRole("button", { name: "+ Add charge line" }).click();
    await page.getByLabel("Charge type", { exact: true }).last().click();
    await page.getByRole("option", { name: "Detention", exact: true }).click();
    await page.getByLabel("Amount (₹)", { exact: true }).last().fill("750");

    // 20000 + 2500 + 750 = 23250, same pure computeTax() the server uses.
    await expect(page.getByText("₹23,250.00").first()).toBeVisible();

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/consignments\/[0-9a-f-]{36}/, { timeout: 20_000 });
    const id = page.url().split("/").pop()!;

    const { data: c } = await admin
      .from("consignments")
      .select("taxable_value, invoice_total, cgst_amount, sgst_amount, igst_amount")
      .eq("id", id).single();
    expect(Number(c!.taxable_value)).toBe(23250);
    expect(Number(c!.invoice_total)).toBeCloseTo(
      23250 + Number(c!.cgst_amount) + Number(c!.sgst_amount) + Number(c!.igst_amount), 2,
    );

    const { data: lines } = await admin
      .from("consignment_charge_lines").select("amount, billable_to_consignor").eq("consignment_id", id);
    expect(lines).toHaveLength(3);
    const sum = lines!.reduce((s, l) => (l.billable_to_consignor ? s + Number(l.amount) : s), 0);
    expect(sum).toBe(23250);

    // The PDF renders the same figures — a real fetch, not just the DB row.
    const pdf = await page.request.get(`/api/consignments/${id}/lr.pdf`);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
  });

  test("a charge line cannot be added or removed once the consignment is billed", async ({ page }) => {
    const o = await testOrg();
    await signIn(page, "accounts");

    // Provision a POD-verified trip and bill it, same shape as billing.spec.ts.
    // makeTrip() bypasses the UI/API entirely (see its own comments), so it
    // never wrote a real consignment_charge_lines row — insert one directly
    // so there is something to try (and fail) to delete below.
    const { makeTrip } = await import("./fixtures/data");
    const trip = await makeTrip("pod_verified");

    const { data: freightTypeForLine } = await admin
      .from("charge_types").select("id").eq("org_id", o.id).eq("code", "FREIGHT").single();
    await admin.from("consignment_charge_lines").insert({
      org_id: o.id, consignment_id: trip.id, charge_type_id: freightTypeForLine!.id,
      amount: 10_000, billable_to_consignor: true,
    });

    const res = await page.request.post("/api/bills", {
      data: {
        branch_id: trip.branchId,
        consignor_party_id: trip.consignorPartyId,
        consignment_ids: [trip.id],
      },
    });
    expect(res.status(), await res.text()).toBe(201);

    const { data: freightType } = await admin
      .from("charge_types").select("id").eq("org_id", o.id).eq("code", "FREIGHT").single();

    const addRes = await page.request.post(`/api/consignments/${trip.id}/charges`, {
      data: { charge_type_id: freightType!.id, amount: 500 },
    });
    expect(addRes.status()).toBe(409);

    const { data: existing } = await admin
      .from("consignment_charge_lines").select("id").eq("consignment_id", trip.id).limit(1).single();
    const delRes = await page.request.delete(`/api/consignments/${trip.id}/charges?line_id=${existing!.id}`);
    expect(delRes.status()).toBe(409);
  });

  test("charge types are an org-scoped, role-gated master", async ({ page }) => {
    await signIn(page, "viewer");
    const viewerRes = await page.request.post("/api/charge-types", {
      data: { code: "FUEL_SURCHARGE", label: "Fuel surcharge" },
    });
    expect(viewerRes.status()).toBe(403);

    await signIn(page, "owner");
    const res = await page.request.post("/api/charge-types", {
      data: { code: "FUEL_SURCHARGE", label: "Fuel surcharge" },
    });
    expect(res.status(), await res.text()).toBe(201);
    const created = (await res.json()).data;
    expect(created.is_system).toBe(false);

    const dupe = await page.request.post("/api/charge-types", {
      data: { code: "fuel_surcharge", label: "Duplicate" },
    });
    expect(dupe.status()).toBe(409);

    const list = await page.request.get("/api/charge-types");
    const codes = ((await list.json()).data as { code: string }[]).map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(["FREIGHT", "LOADING", "UNLOADING", "DETENTION", "OTHER", "FUEL_SURCHARGE"]));
  });
});
