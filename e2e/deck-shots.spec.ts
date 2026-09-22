import { test } from "@playwright/test";
import { admin } from "./fixtures/data";

/** High-resolution product screenshots for the pitch deck. */
test.use({ deviceScaleFactor: 2 });

async function demoOrg() {
  const { data } = await admin
    .from("organisations").select("id").eq("legal_name", "Shree Balaji Roadlines").single();
  return data!.id;
}

test("desktop screens", async ({ page }) => {
  const orgId = await demoOrg();
  // The proxy signs in as the demo owner automatically in development.
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto("/dashboard");
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "docs/deck-shots/dashboard.png" });

  await page.goto("/consignments");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "docs/deck-shots/register.png" });

  const { data: lr } = await admin.from("consignments")
    .select("id, tracking_token").eq("org_id", orgId).eq("status", "pod_verified").limit(1).single();

  await page.goto(`/consignments/${lr!.id}`);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: "docs/deck-shots/lr-detail.png" });

  await page.goto("/fleet");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "docs/deck-shots/fleet.png" });

  await page.goto("/bills");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "docs/deck-shots/bills.png" });

  await page.goto("/consignments/new");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "docs/deck-shots/new-lr.png" });

  // Public tracking, as the customer sees it.
  const { data: tr } = await admin.from("consignments")
    .select("tracking_token").eq("org_id", orgId).eq("status", "in_transit").limit(1).single();
  await page.setViewportSize({ width: 620, height: 1000 });
  await page.goto(`/track/${tr!.tracking_token}`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "docs/deck-shots/tracking.png", fullPage: true });
});

test("driver phone", async ({ page }) => {
  const orgId = await demoOrg();
  const { data: row } = await admin.from("access_tokens")
    .select("token, consignments!inner(org_id)")
    .eq("consignments.org_id", orgId).is("revoked_at", null).limit(1).single();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/d/${row!.token}`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "docs/deck-shots/driver.png" });

  await page.getByRole("button", { name: "हिन्दी" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "docs/deck-shots/driver-hindi.png" });
});
