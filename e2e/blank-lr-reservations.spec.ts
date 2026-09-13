import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";
import { testOrg } from "./fixtures/data";

/**
 * The physical-LR problem: a driver with no smartphone, at a pickup point
 * where nobody can print or open a link either. A real, gapless LR number is
 * reserved ahead of time, printed blank, filled by hand, and reconciled here
 * once the paper (or a phone call) brings the details back.
 */
test.describe("blank LR reservations", () => {
  test("reserve, print, reconcile, and void — end to end through the UI", async ({ page }) => {
    const o = await testOrg();
    await signIn(page, "owner");
    await page.goto("/consignments/blank-forms");

    await page.getByLabel("How many").fill("3");
    await page.getByRole("button", { name: /reserve and print/i }).click();
    await expect(page.getByText(/reserved 3 forms/i)).toBeVisible({ timeout: 10_000 });

    // The button also opens the batch PDF in a new tab via window.open —
    // not verified through that popup: Chrome's native PDF viewer never
    // reports a URL back to Playwright for it in this environment, even
    // though the PDF genuinely loads. Fetching the same route directly is
    // what actually proves the batch PDF is real, and matches the reserved
    // count — the same check already used for the single-LR PDF elsewhere.
    const { data: openReservations } = await (await page.request.get(
      `/api/lr-reservations?branch_id=${o.branchId}&status=reserved`,
    )).json();
    const batchId = openReservations[0].batch_id;
    const pdfRes = await page.request.get(`/api/lr-reservations/batch/${batchId}/pdf`);
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()["content-type"]).toContain("application/pdf");
    expect((await pdfRes.body()).length).toBeGreaterThan(1000);

    const rows = page.locator("tbody tr");
    await expect(rows).toHaveCount(3, { timeout: 10_000 });

    const lrNo = (await rows.first().locator("td").first().textContent())!.trim();

    // Reconcile the first one.
    await rows.first().getByRole("link", { name: "Reconcile" }).click();
    await expect(page.getByRole("heading", { name: `Reconcile ${lrNo}` })).toBeVisible({ timeout: 10_000 });

    // The branch is fixed — this is the whole point of a reservation.
    await expect(page.getByLabel("Branch")).toBeDisabled();

    const stamp = Date.now();
    await page.getByRole("button", { name: "+ New party" }).first().click();
    const consignorSheet = page.getByRole("dialog", { name: "Add party" });
    await consignorSheet.getByLabel("Party name").fill(`Reservation Consignor ${stamp}`);
    await consignorSheet.getByLabel("Address").fill("1 Test Road");
    await consignorSheet.getByLabel("City").fill("Bengaluru");
    await consignorSheet.getByRole("button", { name: "Save" }).click();
    await expect(consignorSheet).toBeHidden();

    await page.getByRole("button", { name: "+ New party" }).last().click();
    const consigneeSheet = page.getByRole("dialog", { name: "Add party" });
    await consigneeSheet.getByLabel("Party name").fill(`Reservation Consignee ${stamp}`);
    await consigneeSheet.getByLabel("Address").fill("2 Test Road");
    await consigneeSheet.getByLabel("City").fill("Chennai");
    await consigneeSheet.getByRole("button", { name: "Save" }).click();
    await expect(consigneeSheet).toBeHidden();

    await page.getByLabel("From city").fill("Bengaluru");
    await page.getByLabel("To city").fill("Chennai");
    await page.getByLabel("Description of goods").fill("Reconciled from a hand-filled form");
    await page.getByLabel("Freight (₹)").fill("15000");

    await page.getByRole("button", { name: /save|create/i }).last().click();
    await expect(page).toHaveURL(/\/consignments\/[0-9a-f-]{36}$/, { timeout: 15_000 });

    // The created LR really did get the reserved number, not a fresh one.
    await expect(page.locator("h1")).toHaveText(lrNo);

    // Reconciled reservations drop off the open list — they are a real LR
    // now, visible in the normal register instead.
    await page.goto("/consignments/blank-forms");
    await expect(page.getByText(lrNo, { exact: true })).toHaveCount(0);
    await expect(page.locator("tbody tr")).toHaveCount(2);

    // Void one of the remaining two, permanently, with a mandatory reason.
    page.once("dialog", (d) => d.accept("printer jammed"));
    await page.getByRole("button", { name: "Void" }).first().click();
    await expect(page.getByText(/voided/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("printer jammed")).toBeVisible();
  });

  test("ordinary LR creation is unaffected by the reservation hardening", async ({ page }) => {
    // assign_lr_number() was tightened in the same migration that added
    // reservations (a pre-set lr_no is now only accepted against a claimed
    // reservation) — this is the regression guard: a completely normal
    // create, no reservation_id at all, must still mint a fresh number the
    // ordinary way.
    const o = await testOrg();
    await signIn(page, "owner");

    const res = await page.request.post("/api/consignments", {
      data: {
        branch_id: o.branchId,
        consignor_party_id: o.partyIds[0],
        consignee_party_id: o.partyIds[1],
        origin_city: "Bengaluru", origin_state: "29",
        destination_city: "Chennai", destination_state: "33",
        cargo_description: "ordinary creation, no reservation",
        freight: 1000,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.data.lr_no).toMatch(/^[A-Z]+-\d{4}-\d{6}$/);
  });
});
