import { test, expect } from "@playwright/test";
import { signIn, pickCombobox } from "./fixtures/auth";
import { admin, makeTrip } from "./fixtures/data";

/**
 * The core loop: create an LR, prove it cannot be dispatched without a truck,
 * then walk it to delivery and check the audit trail.
 */
test.describe("lorry receipt lifecycle", () => {
  test("creates an LR with a gapless number and a live tax preview", async ({ page }) => {
    await signIn(page, "dispatcher");
    await page.goto("/consignments/new");

    await pickCombobox(page, "Consignor", "Test Consignor");
    await pickCombobox(page, "Consignee", "Test Consignee");
    await page.getByLabel("Description of goods").fill("HDPE granules");
    await page.getByLabel("Freight (₹)", { exact: true }).fill("42000");
    await page.getByLabel("Loading (₹)", { exact: true }).fill("1500");

    // The preview computes with the same pure function the server uses.
    await expect(page.getByText("₹43,500.00").first()).toBeVisible();

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/consignments\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await expect(page.locator("h1")).toHaveText(/^[A-Z]{2,6}-\d{4}-\d{6}$/);
    await expect(page.getByText("Draft")).toBeVisible();
  });

  test("refuses to dispatch without a vehicle and driver, then succeeds", async ({ page }) => {
    // Provisioned as a draft with nothing assigned: the seed no longer carries
    // spare drafts, and borrowing one made this test depend on run order.
    const trip = await makeTrip("draft");
    await admin.from("consignments")
      .update({ vehicle_id: null, driver_id: null })
      .eq("id", trip.id);

    await signIn(page, "dispatcher");
    await page.goto(`/consignments/${trip.id}`);

    await page.getByRole("button", { name: "Dispatch" }).click();
    await expect(page.locator("[data-sonner-toast]"))
      .toContainText(/vehicle and a driver are required/i, { timeout: 15_000 });

    // Assign both, and the same action now succeeds.
    const { data: v } = await admin.from("vehicles").select("id").is("deleted_at", null).limit(1).single();
    const { data: d } = await admin.from("drivers").select("id").is("deleted_at", null).limit(1).single();
    await admin.from("consignments")
      .update({ vehicle_id: v!.id, driver_id: d!.id })
      .eq("id", trip.id);

    await page.reload();
    await page.getByRole("button", { name: "Dispatch" }).click();
    await expect(page.locator("header").getByText("Dispatched")).toBeVisible({ timeout: 15_000 });
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
