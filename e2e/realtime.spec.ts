import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";
import { makeTrip } from "./fixtures/data";

/**
 * The demo moment: the driver taps Unloaded on his phone and the card moves on
 * the dispatcher's screen, with nobody refreshing anything.
 */
test.describe("live Today board", () => {
  test("a driver milestone moves the card without a refresh", async ({ page, request }) => {
    const trip = await makeTrip("in_transit");

    await signIn(page);
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    // The socket must actually connect, or this test would pass on a poll.
    await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 20_000 });

    const card = page.getByText(trip.lr_no);
    await expect(card).toBeVisible();

    const inTransitColumn = page.locator("section > div").filter({ hasText: "In transit" });
    await expect(inTransitColumn.getByText(trip.lr_no)).toBeVisible();

    // The driver, on his phone, from a completely separate session.
    const res = await request.post(`/api/d/${trip.driverToken}/milestone`, {
      data: { kind: "unloaded" },
    });
    expect(res.ok()).toBeTruthy();

    // No page.reload() anywhere: the board must move on its own.
    const deliveredColumn = page.locator("section > div").filter({ hasText: "Delivered" });
    await expect(deliveredColumn.getByText(trip.lr_no)).toBeVisible({ timeout: 20_000 });
    await expect(inTransitColumn.getByText(trip.lr_no)).toHaveCount(0);
  });

  test("the indicator acknowledges the update", async ({ page, request }) => {
    const trip = await makeTrip("dispatched");

    await signIn(page);
    await expect(page.getByText("Live", { exact: true })).toBeVisible({ timeout: 20_000 });

    await request.post(`/api/d/${trip.driverToken}/milestone`, { data: { kind: "loaded" } });

    await expect(page.getByText("Updated just now")).toBeVisible({ timeout: 15_000 });
  });
});
