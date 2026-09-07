import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";

import { admin, makeTrip, testOrg } from "./fixtures/data";

test.describe("freight billing", () => {
  test("bulk-bills every verified consignment for one consignor", async ({ page }) => {
    // Provision three billable trips sharing one consignor, so the test does
    // not depend on what earlier runs left behind.
    const first = await makeTrip("pod_verified");
    await makeTrip("pod_verified", { consignorId: first.consignorPartyId });
    await makeTrip("pod_verified", { consignorId: first.consignorPartyId });

    await signIn(page, "accounts");
    await page.goto("/bills/new");

    await page.getByRole("button", { name: "Select all for one consignor" }).click();

    const summary = page.getByText(/\d+ selected/);
    await expect(summary).toBeVisible();
    expect(Number((await summary.textContent())!.match(/\d+/)![0])).toBeGreaterThan(0);

    await page.getByRole("button", { name: "Raise bill" }).click();
    await expect(page).toHaveURL(/\/bills$/, { timeout: 20_000 });
    await expect(page.locator("td").filter({ hasText: /^[A-Z]{2,6}-\d{4}-\d{6}$/ }).first()).toBeVisible();
  });

  test("the bill total equals the tax engine's figure", async ({ page }) => {
    await signIn(page, "accounts");

    const o = await testOrg();
    const { data: bill } = await admin
      .from("freight_bills")
      .select("id, taxable_value, cgst_amount, sgst_amount, igst_amount, total_amount")
      .eq("org_id", o.id)
      .limit(1).single();

    const parts =
      Number(bill!.taxable_value) + Number(bill!.cgst_amount) +
      Number(bill!.sgst_amount) + Number(bill!.igst_amount);

    expect(Number(bill!.total_amount)).toBeCloseTo(parts, 2);
    // IGST and CGST are mutually exclusive.
    expect(Number(bill!.igst_amount) > 0 && Number(bill!.cgst_amount) > 0).toBe(false);
  });

  test("refuses to bill the same consignment twice", async ({ page }) => {
    await signIn(page, "accounts");

    const o = await testOrg();
    const { data: line } = await admin
      .from("bill_lines")
      .select("consignment_id, freight_bills!inner(org_id)")
      .eq("freight_bills.org_id", o.id)
      .limit(1).single();
    const { data: c } = await admin
      .from("consignments").select("branch_id, consignor_party_id")
      .eq("id", line!.consignment_id).single();

    const res = await page.request.post("/api/bills", {
      data: {
        branch_id: c!.branch_id,
        consignor_party_id: c!.consignor_party_id,
        consignment_ids: [line!.consignment_id],
      },
    });

    expect(res.status()).toBe(409);
    expect((await res.json()).error).toMatch(/POD-verified|unbilled/i);
  });

  test("a viewer cannot raise a bill", async ({ page }) => {
    await signIn(page, "viewer");
    const res = await page.request.post("/api/bills", {
      data: {
        branch_id: "00000000-0000-0000-0000-000000000000",
        consignor_party_id: "00000000-0000-0000-0000-000000000000",
        consignment_ids: ["00000000-0000-0000-0000-000000000000"],
      },
    });
    expect(res.status()).toBe(403);
  });

  test("serves an invoice PDF and a Tally CSV", async ({ page }) => {
    await signIn(page, "accounts");
    const o = await testOrg();
    const { data: bill } = await admin
      .from("freight_bills").select("id, bill_no").eq("org_id", o.id).limit(1).single();

    const pdf = await page.request.get(`/api/bills/${bill!.id}/invoice.pdf`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    const csv = await page.request.get(`/api/bills/${bill!.id}/tally.csv`);
    expect(csv.status()).toBe(200);
    const text = await csv.text();
    expect(text.charCodeAt(0)).toBe(0xfeff);              // BOM for Tally on Windows
    expect(text).toContain("\r\n");                        // CRLF
    expect(text).toContain("Date,Voucher Type,Voucher No");
    expect(text).toContain(bill!.bill_no);
  });
});
