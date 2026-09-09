import { test, expect, type Locator, type Page } from "@playwright/test";
import { signIn } from "./fixtures/auth";

/**
 * Radix's Popover content also carries role="dialog" (it is not overridden
 * anywhere in components/ui/popover.tsx — this is the primitive's own
 * default). Our Combobox opens one of these inside a Sheet, which is ALSO
 * role="dialog", so a bare page.getByRole("dialog") is ambiguous the moment
 * a Combobox is open, or even mid-close-transition, inside one — a strict
 * mode violation, or worse, a locator that silently resolves to whichever of
 * the two happens to match first on a given retry. Every sheet in this file
 * is located by its title instead, which only the Sheet has.
 */
function sheetByTitle(page: Page, title: string | RegExp) {
  return page.getByRole("dialog", { name: title });
}

/**
 * Picks an option from one of our Combobox triggers, retrying the whole
 * open-click cycle if the first attempt does not land. Kept even after
 * fixing the role="dialog" ambiguity above, which explained most of what
 * looked like flakiness here: cheap insurance against a genuine, separate UI
 * race under a loaded dev server, and it turns a silent no-op into a loud,
 * retried, eventually-clear failure instead.
 */
async function pickComboboxOption(page: Page, trigger: Locator, optionName: string) {
  await expect(async () => {
    await trigger.click();
    await page.getByRole("option", { name: optionName }).click();
    await expect(trigger).toHaveText(optionName, { timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

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
    const sheet = sheetByTitle(page, "Edit organisation");
    await expect(sheet).toBeVisible();

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
    const sheet = sheetByTitle(page, "Edit organisation");
    await sheet.getByLabel("IFSC").fill("not-an-ifsc");
    await sheet.getByRole("button", { name: "Save" }).click();

    await expect(sheet.getByText(/not a valid IFSC/)).toBeVisible();
    // The sheet stays open on a validation error — nothing was lost.
    await expect(sheet).toBeVisible();
  });
});

test.describe("branches", () => {
  test("a branch's state can be corrected after it is created — it was write-only before", async ({ page }) => {
    await signIn(page, "owner");
    await page.goto("/settings");

    const name = `Edit Test Branch ${Date.now()}`;
    // Prefixes must be letters only (A-Z), so a base-36 or numeric id cannot
    // be used to keep this run unique — this maps the clock to three letters.
    const runLetters = [0, 1, 2]
      .map((i) => String.fromCharCode(65 + Math.floor(Date.now() / 26 ** i) % 26))
      .join("");
    await page.getByRole("button", { name: "Add branch" }).click();
    const addSheet = sheetByTitle(page, "Add branch");
    await addSheet.getByLabel("Branch name").fill(name);
    await pickComboboxOption(page, addSheet.getByLabel("State"), "Tamil Nadu");
    await addSheet.getByLabel("LR prefix").fill(`E${runLetters}`);
    await addSheet.getByLabel("Invoice prefix").fill(`I${runLetters}`);
    await addSheet.getByRole("button", { name: "Save" }).click();
    await expect(addSheet).toBeHidden();
    // Not getByText(name): the same name now also appears as an <option> in
    // Your Home Branch's select, and getByText matches option text too.
    const editButton = page.getByRole("button", { name: `Edit ${name}` });
    await expect(editButton).toBeVisible({ timeout: 15_000 });

    // Wrong state, corrected — this had no field to fix it before.
    await editButton.click();
    const editSheet = sheetByTitle(page, `Edit ${name}`);
    await pickComboboxOption(page, editSheet.getByLabel("State"), "Karnataka");
    await editSheet.getByRole("button", { name: "Save" }).click();
    await expect(editSheet).toBeHidden();

    // Re-open and confirm the correction actually persisted, not just that
    // the sheet closed without error. A real reload, not another click on
    // the same button: RecordSheet fires router.refresh() without awaiting
    // it, so clicking Edit again immediately can reopen against the PAGE'S
    // still-stale pre-save props — this had briefly reproduced as "the
    // correction did not stick" before tracing it to that race rather than
    // to the write itself, which a fresh navigation sidesteps entirely.
    await page.reload();
    await page.getByRole("button", { name: `Edit ${name}` }).click();
    await expect(sheetByTitle(page, `Edit ${name}`).getByLabel("State")).toHaveText("Karnataka");
  });
});
