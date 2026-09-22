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

/**
 * Tier A of the physical-LR problem: a driver with no smartphone still needs
 * a printed LR before he leaves, and the office is often nowhere near where
 * the truck actually is. The consignor's own premises almost always has
 * someone who already prints their own delivery paperwork, so this puts the
 * PDF in front of THAT person instead of assuming the driver ever opens a
 * link at all.
 */
test.describe("Send LR to consignor", () => {
  test("is available from creation — unlike the driver link, it needs no dispatch", async ({ page }) => {
    const trip = await makeTrip("draft");
    await signIn(page, "owner");
    await page.goto(`/consignments/${trip.id}`);
    await expect(page.getByRole("button", { name: /send lr to consignor/i })).toBeVisible();
  });

  /**
   * Unlike "Send to driver" and "Send tracking", this button cannot be a
   * plain href built from a prop: the LR PDF route requires a real session
   * (correctly — it re-renders through the caller's own RLS-scoped read), so
   * a link to it would 401 the moment a consignor with no LogiFlow account
   * opened it on their phone. This asserts the actual fix: the button fetches
   * a signed link first, and that signed link is genuinely fetchable with
   * NO authentication at all — a fresh, cookieless request context, exactly
   * what the consignor's phone would be.
   */
  test("opens WhatsApp with a signed link that needs no login to open", async ({ page, context }) => {
    const trip = await makeTrip("draft");
    await signIn(page, "owner");
    await page.goto(`/consignments/${trip.id}`);

    // Not waitForLoadState(): with real network access, wa.me actually
    // redirects to api.whatsapp.com before the popup finishes loading (in a
    // sandboxed CI runner with no network it would instead hang trying to
    // open the WhatsApp app protocol). The URL is available the instant the
    // popup opens, before either of those matters.
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: /send lr to consignor/i }).click(),
    ]);
    const href = popup.url();

    // wa.me/91<number> and api.whatsapp.com/send/?phone=91<number> are the
    // same destination — which one `popup.url()` reports depends on whether
    // the redirect had already completed by the time this read happens.
    expect(href).toMatch(/wa\.me\/91|phone=91/);
    expect(href).not.toContain("localhost");

    // URLSearchParams, not manual splitting: api.whatsapp.com's redirect
    // uses form encoding (+ for space), wa.me uses plain percent-encoding,
    // and a naive "+" → " " replacement would also corrupt a literal "+"
    // inside the signed URL's own base64 token if one ever landed there.
    const text = new URL(href).searchParams.get("text") ?? "";
    expect(text).toContain(trip.lr_no);

    const signedUrl = text.match(/https?:\/\/\S+\/storage\/v1\/\S+/)?.[0];
    expect(signedUrl, "a signed storage URL must be embedded in the message").toBeTruthy();

    // A genuinely fresh, unauthenticated context — no cookies at all, the
    // same starting point as a phone that has never opened this app.
    const anonCtx = await context.browser()!.newContext();
    const res = await anonCtx.request.get(signedUrl!);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"]).toContain("application/pdf");
    await anonCtx.close();
  });
});
