import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";
import { makeTrip, admin } from "./fixtures/data";
import { placeholderPodPng } from "../scripts/lib/placeholder-pod";

/**
 * "Mark delivered" already reaches this exact status with a bare force:true
 * click — true since before this feature existed. What was missing was an
 * honest record of *why* there's no POD: a driver who phoned it in, with the
 * physical proof still somewhere between the delivery point and the office.
 */
test.describe("phoned-in delivery", () => {
  test("shows a neutral badge and timeline annotation, invisible on public tracking, clears on a real POD", async ({
    page, context,
  }) => {
    const trip = await makeTrip("in_transit");
    await signIn(page, "owner");
    await page.goto(`/consignments/${trip.id}`);

    await expect(page.getByRole("button", { name: /delivered — phoned in/i })).toBeVisible();
    await page.getByRole("button", { name: /delivered — phoned in/i }).click();
    await expect(page.getByText(/phoned in — pod pending/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/delivered \(phoned in\)/i)).toBeVisible();

    // The action is a one-time thing — it only ever offers itself from
    // in_transit, and this consignment has moved past that now.
    await expect(page.getByRole("button", { name: /delivered — phoned in/i })).toHaveCount(0);

    // STATUS_TOKENS' own rule is that colour is exclusively status — this
    // badge must not borrow one of them, or it risks being misread as a
    // status change rather than an annotation on top of "Delivered".
    const badge = page.getByText(/phoned in — pod pending/i);
    await expect(badge).toHaveCSS("border-style", "dashed");

    // A consignee must never see an internal ops nuance like this.
    const trackCtx = await context.browser()!.newContext();
    const trackPage = await trackCtx.newPage();
    await trackPage.goto(`/track/${trip.tracking_token}`);
    const bodyText = (await trackPage.locator("body").innerText()).toLowerCase();
    expect(bodyText).not.toContain("phoned in");
    expect(bodyText).not.toContain("pod pending");
    await trackCtx.close();

    // A real POD arriving and being verified is what actually resolves the
    // "pending" — not a timer, not a manual dismissal.
    const { data: org } = await admin.from("consignments").select("org_id").eq("id", trip.id).single();
    const clientId = crypto.randomUUID();
    const path = `${org!.org_id}/${trip.id}/${clientId}.png`;
    await admin.storage.from("pods").upload(path, placeholderPodPng(1), { contentType: "image/png", upsert: true });
    await admin.from("consignment_pods").insert({
      org_id: org!.org_id, consignment_id: trip.id, page_no: 1,
      storage_path: path, client_id: clientId, uploaded_by_type: "office",
    });

    await page.goto(`/consignments/${trip.id}`);
    await page.getByRole("button", { name: "Verify POD" }).click();
    await expect(page.locator("header").getByText("POD verified")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/phoned in — pod pending/i)).toHaveCount(0);
  });

  test("is only offered from in_transit, never for a trip that already has a real POD", async ({ page }) => {
    const trip = await makeTrip("pod_verified");
    await signIn(page, "owner");
    await page.goto(`/consignments/${trip.id}`);
    await expect(page.getByRole("button", { name: /delivered — phoned in/i })).toHaveCount(0);
  });
});
