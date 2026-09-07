import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";

test("control heights and LR form", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, "dispatcher");
  await page.goto("/consignments/new");
  await page.waitForTimeout(900);

  // Every control on this form must share one height, or the grid looks broken.
  const heights: Record<string, number> = {};
  for (const label of ["Branch", "Consignor", "From city", "Freight (₹)", "Vehicle", "Freight terms"]) {
    const box = await page.getByLabel(label, { exact: true }).boundingBox();
    heights[label] = Math.round(box!.height);
  }
  console.log(">> control heights:", JSON.stringify(heights));
  expect(new Set(Object.values(heights)).size).toBe(1);
  expect(Object.values(heights)[0]).toBe(44);

  await page.screenshot({ path: "docs/screens/06-lr-form.png", fullPage: true });

  // And the searchable picker itself.
  await page.getByLabel("Consignor", { exact: true }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "docs/screens/07-combobox.png" });
});
