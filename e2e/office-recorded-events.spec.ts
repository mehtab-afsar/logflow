import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";
import { makeTrip, admin } from "./fixtures/data";
import { placeholderPodPng } from "../scripts/lib/placeholder-pod";

/**
 * The other half of the phone-fallback story: a driver with no smartphone
 * calls the office directly, and the office needs a correctly-attributed way
 * to record what he said — a milestone, or the physical POD once it finally
 * arrives some other way.
 */
test.describe("office-recorded milestones", () => {
  test("records via the UI, auto-advances the status, attributed to staff not the driver", async ({ page }) => {
    const trip = await makeTrip("dispatched");
    await signIn(page, "owner");
    await page.goto(`/consignments/${trip.id}`);

    const button = page.getByRole("button", { name: /phoned in: loaded/i });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.getByText(/recorded loaded — phoned in/i)).toBeVisible({ timeout: 10_000 });

    // The button now offers the next milestone, not the same one again.
    await expect(page.getByRole("button", { name: /phoned in: departed/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /phoned in: departed/i }).click();
    await expect(page.getByText(/recorded departed — phoned in/i)).toBeVisible({ timeout: 10_000 });

    // "departed" from "dispatched" auto-advances to in_transit — same rule
    // the driver-token path uses, exercised here through the office path.
    await expect(page.getByText("In transit", { exact: true })).toBeVisible({ timeout: 10_000 });

    const { data: events } = await admin
      .from("consignment_events")
      .select("kind, milestone, actor_type, payload")
      .eq("consignment_id", trip.id)
      .eq("kind", "milestone")
      .order("created_at");
    expect(events).toHaveLength(2);
    for (const e of events!) {
      expect(e.actor_type).toBe("staff");
      expect((e.payload as { reported_via?: string }).reported_via).toBe("phone");
    }
  });

  test("is not offered before dispatch or after delivery", async ({ page }) => {
    const draft = await makeTrip("draft");
    await signIn(page, "owner");
    await page.goto(`/consignments/${draft.id}`);
    await expect(page.getByRole("button", { name: /phoned in:/i })).toHaveCount(0);

    const delivered = await makeTrip("delivered");
    await page.goto(`/consignments/${delivered.id}`);
    await expect(page.getByRole("button", { name: /phoned in:/i })).toHaveCount(0);
  });

  test("a viewer cannot record one, even by calling the API directly", async ({ page }) => {
    const trip = await makeTrip("dispatched");
    await signIn(page, "viewer");
    const res = await page.request.post(`/api/consignments/${trip.id}/milestone`, {
      data: { kind: "loaded" },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe("office-attached POD", () => {
  test("attaches via the UI, correctly attributed to 'office', and unlocks Verify POD", async ({ page }) => {
    const trip = await makeTrip("delivered");
    await signIn(page, "accounts");
    await page.goto(`/consignments/${trip.id}`);

    await page.getByRole("button", { name: /attach pod/i }).click();
    // No visible file chooser to interact with in a headless run — set the
    // file directly on the hidden input, exactly like the driver-portal
    // tests already do for the same reason.
    await page.locator('input[type="file"]').setInputFiles({
      name: "pod.png", mimeType: "image/png", buffer: placeholderPodPng(1),
    });
    await expect(page.getByText("POD attached")).toBeVisible({ timeout: 10_000 });

    const { data: pod } = await admin
      .from("consignment_pods").select("uploaded_by_type")
      .eq("consignment_id", trip.id).single();
    expect(pod!.uploaded_by_type).toBe("office");

    await expect(page.getByRole("button", { name: "Verify POD" })).toBeVisible({ timeout: 10_000 });
  });
});
