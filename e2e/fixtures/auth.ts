import { type Page, expect } from "@playwright/test";

export const ROLES = ["owner", "dispatcher", "accounts", "viewer"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Acts as a given role.
 *
 * There is no login screen — the proxy signs page requests in automatically in
 * development, and this hits the dev-only session switcher to change role.
 * Onboarding and real authentication are a later phase; when they land, this
 * fixture is the single place that needs to change.
 */
export async function signIn(page: Page, who: Role = "owner") {
  const res = await page.request.get(`/api/dev/session?role=${who}`);
  expect(res.status(), `dev session switch to ${who}`).toBe(200);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}
