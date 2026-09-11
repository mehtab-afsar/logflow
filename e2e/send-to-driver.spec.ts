import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";
import { makeTrip } from "./fixtures/data";

/**
 * ShareButtons builds a wa.me link client-side from window.location.origin,
 * with one deliberate override: a localhost origin is discarded in favour of
 * NEXT_PUBLIC_APP_URL, because a link that says "localhost" points a driver's
 * phone at itself — this is what produced the real ERR_SSL_PROTOCOL_ERROR
 * report. This file exists because that whole path had no dedicated coverage
 * beyond one string embedded inside a longer dispatch test.
 */
test.describe("Send to driver", () => {
  test("is absent before dispatch, appears once a driver link exists", async ({ page }) => {
    const trip = await makeTrip("draft");
    await signIn(page, "owner");
    await page.goto(`/consignments/${trip.id}`);
    await expect(page.getByRole("link", { name: /send to driver/i })).toHaveCount(0);

    await page.getByRole("button", { name: "Dispatch" }).click();
    await expect(page.getByRole("link", { name: /send to driver/i })).toBeVisible({ timeout: 10_000 });
  });

  test("the WhatsApp link targets the driver's number and never points at localhost", async ({ page, context }) => {
    const trip = await makeTrip("dispatched");
    await signIn(page, "owner");
    await page.goto(`/consignments/${trip.id}`);

    const link = page.getByRole("link", { name: /send to driver/i });
    const href = (await link.getAttribute("href"))!;

    expect(href).toContain("wa.me/91");
    expect(href).not.toContain("localhost");

    const text = decodeURIComponent(href.split("text=")[1]);
    expect(text).toContain(trip.lr_no);

    const driverUrl = text.match(/https?:\/\/\S+\/d\/\S+/)?.[0];
    expect(driverUrl, "the driver portal URL must be embedded in the message").toBeTruthy();

    // Opened exactly as the driver would: a fresh context, no session,
    // nothing but the link.
    const driverCtx = await context.browser()!.newContext();
    const driverPage = await driverCtx.newPage();
    await driverPage.goto(driverUrl!);
    await expect(driverPage.getByText(trip.lr_no)).toBeVisible({ timeout: 10_000 });
    await expect(driverPage.getByRole("button", { name: /sign in|log in/i })).toHaveCount(0);
    await driverCtx.close();
  });
});
