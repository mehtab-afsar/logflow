import { test, expect } from "@playwright/test";
import { signIn, pickCombobox } from "./fixtures/auth";
import { testOrg } from "./fixtures/data";

/**
 * Rate contracts (migration 20260915000002) — a standing consignor/vendor
 * rate, looked up and suggested, never applied automatically.
 */
test.describe("rate contracts", () => {
  test("is an org-scoped, role-gated master", async ({ page }) => {
    const o = await testOrg();

    await signIn(page, "viewer");
    const viewerRes = await page.request.post("/api/contracts", {
      data: {
        counterparty_type: "consignor", party_id: o.partyIds[0],
        rate: 30000, valid_from: "2026-01-01",
      },
    });
    expect(viewerRes.status()).toBe(403);

    await signIn(page, "owner");
    const res = await page.request.post("/api/contracts", {
      data: {
        counterparty_type: "consignor", party_id: o.partyIds[0],
        rate: 30000, valid_from: "2026-01-01",
      },
    });
    expect(res.status(), await res.text()).toBe(201);

    const list = await page.request.get("/api/contracts");
    const rows = (await list.json()).data as { id: string; party_id: string }[];
    expect(rows.some((r) => r.party_id === o.partyIds[0])).toBe(true);
  });

  test("the most specific matching contract wins the lookup", async ({ page }) => {
    const o = await testOrg();
    await signIn(page, "owner");

    // Other tests in this run share the same test org and leave their own
    // contracts behind (no reset between tests) — a later valid_from always
    // sorts first within a specificity tier, so dating these later than any
    // other test's makes this test's own contracts win deterministically
    // regardless of run order.
    const blanket = await page.request.post("/api/contracts", {
      data: { counterparty_type: "consignor", party_id: o.partyIds[0], rate: 20000, valid_from: "2026-06-01" },
    });
    expect(blanket.status()).toBe(201);

    // ...and a more specific route rate, which should win for that route.
    const specific = await page.request.post("/api/contracts", {
      data: {
        counterparty_type: "consignor", party_id: o.partyIds[0], rate: 25000, valid_from: "2026-06-01",
        route_origin_city: "Contract City A", route_destination_city: "Contract City B",
      },
    });
    expect(specific.status()).toBe(201);

    const routeMatch = await page.request.get(
      `/api/contracts/lookup?counterparty_type=consignor&party_id=${o.partyIds[0]}&origin_city=Contract+City+A&destination_city=Contract+City+B`,
    );
    expect((await routeMatch.json()).data.rate).toBe(25000);

    const noRouteMatch = await page.request.get(
      `/api/contracts/lookup?counterparty_type=consignor&party_id=${o.partyIds[0]}&origin_city=Somewhere+Else&destination_city=Elsewhere`,
    );
    expect((await noRouteMatch.json()).data.rate).toBe(20000);
  });

  test("suggests a matching rate on the LR form, and it is optional to accept", async ({ page }) => {
    const o = await testOrg();
    await signIn(page, "owner");

    // Latest valid_from of any blanket contract this suite creates for this
    // party — see the note in the previous test.
    const contract = await page.request.post("/api/contracts", {
      data: {
        counterparty_type: "consignor", party_id: o.partyIds[0], rate: 27500, valid_from: "2026-09-01",
      },
    });
    expect(contract.status()).toBe(201);

    await signIn(page, "dispatcher");
    await page.goto("/consignments/new");
    await pickCombobox(page, "Consignor", "Test Consignor");
    await pickCombobox(page, "Consignee", "Test Consignee");

    await expect(page.getByText("Standing rate for this consignor")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("₹27,500.00")).toBeVisible();

    await page.getByRole("button", { name: "Use this rate" }).click();
    await expect(page.getByLabel("Amount (₹)", { exact: true }).first()).toHaveValue("27500");

    // It is a suggestion, not a lock — the dispatcher can still type over it.
    await page.getByLabel("Description of goods").fill("Overridden a suggested rate");
    await page.getByLabel("Amount (₹)", { exact: true }).first().fill("19999");

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/consignments\/[0-9a-f-]{36}/, { timeout: 20_000 });
  });
});
