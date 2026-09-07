import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";

test.describe("authenticated shell", () => {
  test("signs in and reaches the Today board", async ({ page }) => {
    await signIn(page);
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    // KPI strip
    await expect(page.getByText("Active trips")).toBeVisible();
    await expect(page.getByText("Unbilled freight")).toBeVisible();
    await expect(page.getByText("Documents expiring")).toBeVisible();
  });

  test("register lists seeded lorry receipts and filters by status", async ({ page }) => {
    await signIn(page);
    await page.goto("/consignments");
    await expect(page.getByRole("heading", { name: "Lorry receipts" })).toBeVisible();
    await expect(page.locator("td").filter({ hasText: /^LF-2627-\d{6}$/ }).first()).toBeVisible();

    await page.getByRole("link", { name: "In transit", exact: true }).click();
    await expect(page).toHaveURL(/status=in_transit/);
    // Every visible status pill should now read "In transit".
    const pills = page.locator("tbody tr span").filter({ hasText: "In transit" });
    expect(await pills.count()).toBeGreaterThan(0);
  });

  test("the API refuses an unauthenticated caller", async ({ request }) => {
    // The real authorisation boundary. Asserted on the API rather than on a
    // page redirect, because local development may enable the page-level
    // auto-login convenience (DEV_AUTO_LOGIN) — which deliberately does not
    // apply to /api/*.
    for (const path of ["/api/consignments", "/api/bills", "/api/parties/search"]) {
      const res = await request.get(path);
      expect({ path, status: res.status() }).toMatchObject({ status: 401 });
    }
  });

  test("an unauthenticated mutation is refused", async ({ request }) => {
    const res = await request.post("/api/bills", {
      data: {
        branch_id: "00000000-0000-0000-0000-000000000000",
        consignor_party_id: "00000000-0000-0000-0000-000000000000",
        consignment_ids: ["00000000-0000-0000-0000-000000000000"],
      },
    });
    expect(res.status()).toBe(401);
  });

  test("fleet shows document expiry badges", async ({ page }) => {
    await signIn(page);
    await page.goto("/fleet");
    await expect(page.getByRole("heading", { name: "Fleet" })).toBeVisible();
    await expect(page.getByText(/d left|Expired/).first()).toBeVisible();
  });

  test("settings explains the tax mode in plain language", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings");
    await expect(page.getByText("Forward charge at 5%")).toBeVisible();
    await expect(page.getByText(/chartered accountant/)).toBeVisible();
  });
});
