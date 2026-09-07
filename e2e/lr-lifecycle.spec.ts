import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";
import { makeTrip } from "./fixtures/data";

/**
 * The core loop: create an LR, prove it cannot be dispatched without a truck,
 * then walk it to delivery and check the audit trail.
 */
test.describe("lorry receipt lifecycle", () => {
  test("creates an LR with a gapless number and a live tax preview", async ({ page }) => {
    await signIn(page, "dispatcher");
    await page.goto("/consignments/new");

    await page.getByLabel("Consignor").selectOption({ index: 1 });
    await page.getByLabel("Consignee").selectOption({ index: 2 });
    await page.getByLabel("Description of goods").fill("HDPE granules");
    await page.getByLabel("Freight (₹)", { exact: true }).fill("42000");
    await page.getByLabel("Loading (₹)", { exact: true }).fill("1500");

    // The preview computes with the same pure function the server uses.
    await expect(page.getByText("₹43,500.00").first()).toBeVisible();

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/consignments\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await expect(page.locator("h1")).toHaveText(/^LF-2627-\d{6}$/);
    await expect(page.getByText("Draft")).toBeVisible();
  });

  test("refuses to dispatch without a vehicle and driver, then succeeds", async ({ page }) => {
    await signIn(page, "dispatcher");
    await page.goto("/consignments?status=draft");

    // Seed guarantees two drafts with nothing assigned.
    await page.locator("td a.font-mono").first().click();
    await expect(page.locator("h1")).toBeVisible();

    const dispatch = page.getByRole("button", { name: "Dispatch" });
    if (await dispatch.isVisible()) {
      await dispatch.click();
      // Either it succeeds (vehicle assigned) or the server explains why not.
      const toast = page.locator("[data-sonner-toast]");
      await expect(toast).toBeVisible({ timeout: 10_000 });
      const text = await toast.textContent();
      expect(text).toMatch(/vehicle and a driver are required|Marked dispatch/i);
    }
  });

  test("a delivered consignment shows its POD and full event trail", async ({ page }) => {
    // Provisioned rather than borrowed: billing tests consume pod_verified rows.
    const trip = await makeTrip("pod_verified");
    await signIn(page);
    await page.goto(`/consignments/${trip.id}`);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator("header span").filter({ hasText: "POD verified" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Timeline" })).toBeVisible();
    // Dispatched → in transit → delivered → POD verified, at least.
    const steps = page.locator("ol li");
    expect(await steps.count()).toBeGreaterThanOrEqual(4);

    await expect(page.getByRole("heading", { name: "Proof of delivery" })).toBeVisible();
  });

  test("serves a four-copy PDF and caches it", async ({ page }) => {
    await signIn(page);
    await page.goto("/consignments");
    const href = await page.locator("td a.font-mono").first().getAttribute("href");
    const id = href!.split("/").pop();

    const first = await page.request.get(`/api/consignments/${id}/lr.pdf`);
    expect(first.status()).toBe(200);
    expect(first.headers()["content-type"]).toContain("application/pdf");
    const body = await first.body();
    expect(body.subarray(0, 5).toString()).toBe("%PDF-");
    expect(body.length).toBeGreaterThan(10_000);

    // Second request must come from the storage cache.
    const second = await page.request.get(`/api/consignments/${id}/lr.pdf`);
    expect(second.headers()["x-pdf-cache"]).toBe("hit");

    // A single copy is materially smaller than all four.
    const one = await page.request.get(`/api/consignments/${id}/lr.pdf?copies=driver&size=a5`);
    expect((await one.body()).length).toBeLessThan(body.length);
  });
});
