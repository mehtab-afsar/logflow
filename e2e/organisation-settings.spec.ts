import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";

/**
 * Risk clause and bank details existed in the schema since onboarding, but
 * until now nothing let an owner change them afterwards — the exact gap
 * flagged when comparing what onboarding collects against what Settings can
 * edit.
 */
test.describe("organisation settings", () => {
  test("risk clause and bank details can be edited and persist", async ({ page }) => {
    await signIn(page, "owner");
    await page.goto("/settings");

    await page.getByRole("button", { name: "Edit" }).first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Edit organisation" })).toBeVisible();

    await sheet.getByLabel("Risk clause").fill("At carrier's risk — special rate applied");
    await sheet.getByLabel("Bank name").fill("Union Bank of India");
    await sheet.getByLabel("Branch").fill("Peenya Industrial Estate");
    await sheet.getByLabel("Account number").fill("123456789012");
    await sheet.getByLabel("IFSC").fill("hdfc0001234"); // lower-case: the schema uppercases it

    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(sheet).toBeHidden();

    await expect(page.getByText("At carrier's risk — special rate applied")).toBeVisible();
    await expect(
      page.getByText(/Union Bank of India \(Peenya Industrial Estate\) · A\/c 123456789012 · IFSC HDFC0001234/),
    ).toBeVisible();

    // Persists across a real reload, not just client state after the sheet closes.
    await page.reload();
    await expect(page.getByText("At carrier's risk — special rate applied")).toBeVisible();
    await expect(page.getByText(/IFSC HDFC0001234/)).toBeVisible();
  });

  test("a bad IFSC is rejected with a message on that field, not a generic error", async ({ page }) => {
    await signIn(page, "owner");
    await page.goto("/settings");

    await page.getByRole("button", { name: "Edit" }).first().click();
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("IFSC").fill("not-an-ifsc");
    await sheet.getByRole("button", { name: "Save" }).click();

    await expect(sheet.getByText(/not a valid IFSC/)).toBeVisible();
    // The sheet stays open on a validation error — nothing was lost.
    await expect(sheet).toBeVisible();
  });
});
