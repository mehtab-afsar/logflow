import { test, expect } from "@playwright/test";

/**
 * The driver portal on a real phone profile.
 *
 * The offline test is the one that matters: a driver photographs the signed POD
 * at a loading dock with no signal, and the product's whole promise is that the
 * photo is not lost.
 */
import { admin, makeTrip } from "./fixtures/data";

/**
 * Each test gets its OWN freshly dispatched trip. Sharing one from the seed
 * meant the first test advanced it and every later test saw a different state
 * — the suite passed once and then starved.
 */
async function liveDriverToken() {
  const trip = await makeTrip("dispatched");
  return { token: trip.driverToken, consignment_id: trip.id };
}

/**
 * The portal opens in the DRIVER'S OWN language (drivers.language), so tests
 * that assert on English copy must switch first. That auto-selection is the
 * feature, not an inconvenience.
 */
async function openInEnglish(page: import("@playwright/test").Page, token: string) {
  await page.goto(`/d/${token}`);
  await expect(page.getByText(/^[A-Z]{2,6}-\d{4}-\d{6}$/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByText("From", { exact: true })).toBeVisible();
}

test.describe("driver portal", () => {
  test("opens with no login and shows the trip", async ({ page }) => {
    const { token } = await liveDriverToken();
    await openInEnglish(page, token);

    await expect(page.getByText("To", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open in Maps/i }).first()).toBeVisible();
    // No sign-in anywhere.
    await expect(page.getByRole("button", { name: /sign in/i })).toHaveCount(0);
  });

  test("opens in the driver's own language by default", async ({ page }) => {
    const { token, consignment_id } = await liveDriverToken();
    const { data } = await admin
      .from("consignments").select("drivers(language)").eq("id", consignment_id).single();
    const lang = (data!.drivers as unknown as { language: string })?.language;

    await page.goto(`/d/${token}`);
    await expect(page.getByText(/^[A-Z]{2,6}-\d{4}-\d{6}$/)).toBeVisible({ timeout: 15_000 });

    const expected = { en: "From", hi: "कहाँ से", kn: "ಎಲ್ಲಿಂದ" }[lang] ?? "From";
    await expect(page.getByText(expected, { exact: true })).toBeVisible();
  });

  test("offers exactly one next action, and it advances", async ({ page }) => {
    const { token } = await liveDriverToken();
    await openInEnglish(page, token);

    // Exactly one primary action is offered at a time — that is the whole
    // design of this screen. Which one depends on how far the trip has got.
    const primary = page.locator("div.sticky button");
    await expect(primary).toHaveCount(1);

    const before = (await primary.textContent())!.trim();
    expect(["Loaded", "Departed", "Reached destination", "Unloaded"]).toContain(before);

    await primary.click();

    // Optimistic: the next step appears without waiting for the network.
    await expect(primary).not.toHaveText(before, { timeout: 10_000 });
  });

  test("switches language without reloading", async ({ page }) => {
    const { token } = await liveDriverToken();
    await openInEnglish(page, token);

    await page.getByRole("button", { name: "हिन्दी" }).click();
    await expect(page.getByText("कहाँ से")).toBeVisible();

    await page.getByRole("button", { name: "ಕನ್ನಡ" }).click();
    await expect(page.getByText("ಎಲ್ಲಿಂದ")).toBeVisible();
  });

  test("queues work offline and drains when the signal returns", async ({ page, context }) => {
    const { token, consignment_id } = await liveDriverToken();
    await openInEnglish(page, token);

    const before = await admin
      .from("consignment_events")
      .select("id", { count: "exact", head: true })
      .eq("consignment_id", consignment_id)
      .eq("kind", "milestone");

    await context.setOffline(true);

    // Two milestones recorded with no signal at all. Which two depends on how
    // far this trip has already been driven by earlier tests, so take whatever
    // the portal currently offers rather than assuming "Loaded".
    const primary = page.locator("div.sticky button").last();
    await expect(primary).toBeVisible();
    const first = (await primary.textContent())!.trim();
    await primary.click();

    await expect(primary).not.toHaveText(first, { timeout: 10_000 });
    await primary.click();

    // The driver must be told his work is safe.
    await expect(page.getByText(/saved on your phone|No signal/i)).toBeVisible({ timeout: 10_000 });

    await context.setOffline(false);

    // The queue drains on its own once the radio is back.
    await expect(page.getByText(/saved on your phone|No signal/i)).toBeHidden({ timeout: 40_000 });

    await expect
      .poll(
        async () => {
          const after = await admin
            .from("consignment_events")
            .select("id", { count: "exact", head: true })
            .eq("consignment_id", consignment_id)
            .eq("kind", "milestone");
          return (after.count ?? 0) - (before.count ?? 0);
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThanOrEqual(2);
  });

  test("a replayed submission does not duplicate — the offline queue is safe to retry", async ({ request }) => {
    const { token, consignment_id } = await liveDriverToken();
    const clientId = crypto.randomUUID();

    const body = { kind: "diesel", amount: 4321, litres: 45, client_id: clientId };
    const first = await request.post(`/api/d/${token}/expense`, { data: body });
    const second = await request.post(`/api/d/${token}/expense`, { data: body });

    expect(first.ok()).toBeTruthy();
    expect(second.ok()).toBeTruthy();
    expect((await second.json()).data.deduped).toBe(true);

    const { count } = await admin
      .from("trip_expenses")
      .select("id", { count: "exact", head: true })
      .eq("consignment_id", consignment_id)
      .eq("client_id", clientId);

    expect(count).toBe(1);
  });

  test("a revoked link stops working immediately", async ({ request }) => {
    // Its own trip and its own token, so revoking cannot affect another test.
    const trip = await makeTrip("draft");
    const { data: c } = await admin
      .from("consignments").select("id, org_id").eq("id", trip.id).single();

    const { data: t } = await admin
      .from("access_tokens")
      .insert({
        org_id: c!.org_id, consignment_id: c!.id, kind: "driver",
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("token, id").single();

    const ok = await request.get(`/api/d/${t!.token}/trip`);
    expect(ok.status()).toBe(200);

    await admin.from("access_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", t!.id);

    const gone = await request.get(`/api/d/${t!.token}/trip`);
    expect(gone.status()).toBe(410);
  });
});
