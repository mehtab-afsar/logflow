import { test, expect } from "@playwright/test";

/**
 * The customer opens this from WhatsApp, on a slow phone, sometimes with
 * JavaScript disabled. Everything below must therefore be true of the raw HTML.
 *
 * The leak assertions are the important half: a tracking link gets forwarded,
 * so the consignee must never see what the consignor is paying.
 */
import { admin, makeTrip } from "./fixtures/data";

/** Provisions its own trip so the suite is repeatable. */
async function aTrackableConsignment() {
  const trip = await makeTrip("in_transit");
  const { data } = await admin
    .from("consignments")
    .select("tracking_token, lr_no, freight, invoice_total, consignor_snapshot, origin_city")
    .eq("id", trip.id)
    .single();
  return data!;
}

test.describe("public tracking without JavaScript", () => {
  test("renders the whole page server-side", async ({ page }) => {
    const c = await aTrackableConsignment();
    await page.goto(`/track/${c.tracking_token}`);

    await expect(page.getByText(c.lr_no)).toBeVisible();
    await expect(page.getByText(c.origin_city, { exact: false })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
    await expect(page.getByText("Vehicle")).toBeVisible();
    await expect(page.getByText("Driver")).toBeVisible();
  });

  test("leaks no money, GSTIN or phone number", async ({ page }) => {
    const c = await aTrackableConsignment();
    await page.goto(`/track/${c.tracking_token}`);
    const html = await page.content();
    // Keyword checks run against RENDERED TEXT: <meta> and <title> carry
    // product copy ("same-day freight billing") that is not customer data.
    const shown = (await page.textContent("body"))!.toLowerCase();

    for (const word of ["freight", "advance", "gstin", "taxable", "cgst", "sgst", "igst", "expense"]) {
      expect(shown).not.toContain(word);
    }
    // Actual values from this consignment
    expect(html).not.toContain(String(Math.round(Number(c.freight))));
    expect(html).not.toContain(String(Math.round(Number(c.invoice_total))));
    const gstin = (c.consignor_snapshot as { gstin?: string })?.gstin;
    if (gstin) expect(html).not.toContain(gstin);

    // Patterns
    expect(html).not.toMatch(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z/);   // any GSTIN
    expect(html).not.toMatch(/(^|[^0-9])[6-9][0-9]{9}([^0-9]|$)/);        // any mobile
  });

  test("shows the driver's first name only", async ({ page }) => {
    const { data: row } = await admin
      .from("consignments")
      .select("tracking_token, drivers(full_name)")
      .eq("status", "in_transit")
      .not("driver_id", "is", null)
      .limit(1)
      .single();

    const full = (row!.drivers as unknown as { full_name: string }).full_name;
    const [first, ...rest] = full.split(" ");

    await page.goto(`/track/${row!.tracking_token}`);
    const shown = (await page.textContent("body"))!;

    expect(shown).toContain(first);
    if (rest.length > 0) expect(shown).not.toContain(rest.join(" "));
  });

  test("an unknown token renders a friendly page, not an error", async ({ page }) => {
    const res = await page.goto("/track/0000000000000000000000000000000000000000");
    expect(res!.status()).toBe(404);
    // Asserted on content rather than visibility: in dev, Next overlays its own
    // error UI on top of the segment's not-found. Production serves only ours.
    const html = await page.content();
    expect(html).toContain("This tracking link");
    expect(html).toContain("check with your transporter");
  });

  test("a draft consignment is not trackable even with a valid token", async ({ page }) => {
    const trip = await makeTrip("draft");
    const res = await page.goto(`/track/${trip.tracking_token}`);
    expect(res!.status()).toBe(404);
  });
});
