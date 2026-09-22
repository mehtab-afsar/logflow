import { type Page, expect } from "@playwright/test";
import { testOrg, TEST_USERS, TEST_PASSWORD, type TestRole } from "./data";

export const ROLES = ["owner", "dispatcher", "accounts", "viewer"] as const;
export type Role = TestRole;

/**
 * Acts as a given role INSIDE THE TEST ORGANISATION.
 *
 * There is no login screen — the proxy signs page requests in automatically in
 * development, and this hits the dev-only session switcher to become a
 * specific user. Signing in as the test org rather than the demo org is what
 * keeps every row a test creates invisible to the developer's session.
 *
 * Onboarding and real authentication are a later phase; when they land, this
 * fixture is the single place that needs to change.
 */
export async function signIn(page: Page, who: Role = "owner") {
  // Make sure the organisation, its users and its masters exist before the
  // first sign-in of the run.
  await testOrg();

  const res = await page.request.get(
    `/api/dev/session?email=${encodeURIComponent(TEST_USERS[who])}&password=${encodeURIComponent(TEST_PASSWORD)}`,
  );
  expect(res.status(), `dev session switch to ${who}`).toBe(200);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

/**
 * Picks an option from a Combobox.
 *
 * The party and vehicle pickers are searchable rather than native selects, so
 * `selectOption` no longer applies: open the trigger, type, choose.
 */
export async function pickCombobox(page: Page, label: string, search: string) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByPlaceholder(/type|registration|name/i).last().fill(search);
  await page.getByRole("option").first().click();
}

/**
 * Fills the LR form's repeatable charges editor (migration
 * 20260915000001 — see features/consignments/components/LrForm.tsx). The
 * first line already has the FREIGHT charge type selected by default, so
 * only its amount needs filling; a second charge adds a line and picks its
 * type from the org's charge_types.
 */
export async function fillLrCharges(page: Page, opts: { freight: string; loading?: string }) {
  await page.getByLabel("Amount (₹)", { exact: true }).first().fill(opts.freight);
  if (opts.loading) {
    await page.getByRole("button", { name: "+ Add charge line" }).click();
    await page.getByLabel("Charge type", { exact: true }).last().click();
    await page.getByRole("option", { name: "Loading", exact: true }).click();
    await page.getByLabel("Amount (₹)", { exact: true }).last().fill(opts.loading);
  }
}
