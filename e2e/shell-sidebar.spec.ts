import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";

test.describe("sidebar", () => {
  test("expands on hover as an overlay, without moving the page", async ({ page }) => {
    await signIn(page);
    await page.goto("/consignments");

    const aside = page.locator("aside");
    const main = page.locator("main");
    const label = page.getByRole("link", { name: "Lorry receipts" }).locator("span");

    const railWidth = (await aside.boundingBox())!.width;
    const mainBefore = (await main.boundingBox())!;
    expect(railWidth).toBeLessThan(80);
    await expect(label).toHaveCSS("opacity", "0");

    await aside.hover();
    await expect(label).toHaveCSS("opacity", "1");
    expect((await aside.boundingBox())!.width).toBeGreaterThan(200);

    // The whole point of the overlay. If the aside grew in the flex row instead,
    // every row of the register would re-lay-out on each hover.
    const mainDuring = (await main.boundingBox())!;
    expect(mainDuring.x).toBe(mainBefore.x);
    expect(mainDuring.width).toBe(mainBefore.width);

    // Moving away closes it again.
    await main.hover({ position: { x: 400, y: 300 } });
    await expect(label).toHaveCSS("opacity", "0");
    expect((await aside.boundingBox())!.width).toBe(railWidth);
  });

  test("keyboard focus expands it, so tabbing is not blind", async ({ page }) => {
    await signIn(page);
    await page.goto("/dashboard");

    const label = page.getByRole("link", { name: "Today" }).locator("span");
    await expect(label).toHaveCSS("opacity", "0");

    await page.getByRole("link", { name: "Today" }).focus();
    await expect(label).toHaveCSS("opacity", "1");
  });
});
