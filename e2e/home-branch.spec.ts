import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";
import { admin, testOrg } from "./fixtures/data";

/**
 * Proves migration 20260910000001 actually changes behaviour, not just that
 * the column exists: New LR must default to the CHOSEN branch even when it
 * sorts after another branch alphabetically — the exact bug this closes.
 */
test.describe("home branch", () => {
  test("overrides the alphabetical default once set in Settings", async ({ page }) => {
    const o = await testOrg();

    // Sorts before "Test Branch", so it would win the old branches[0]
    // default. Its own prefixes — the test org already owns ET/ETI.
    const { data: overflow, error } = await admin
      .from("branches")
      .insert({
        org_id: o.id, name: "AAA Overflow Branch", city: "Bengaluru", state_code: "29",
        lr_prefix: "EA", inv_prefix: "EAI",
      })
      .select("id, name")
      .single();
    if (error) throw new Error(`overflow branch: ${error.message}`);

    await signIn(page, "owner");

    // Baseline: with no home branch set, New LR falls back to alphabetical —
    // the overflow branch, not the one the test actually wants to use.
    await page.goto("/consignments/new");
    await expect(page.getByLabel("Branch")).toHaveText(overflow.name);

    // Set the home branch in Settings.
    await page.goto("/settings");
    await page.getByLabel("Home branch").selectOption({ label: "Test Branch" });
    await expect(page.getByText("Home branch updated")).toBeVisible({ timeout: 10_000 });

    // New LR now defaults to the chosen branch, not the alphabetical one.
    await page.goto("/consignments/new");
    await expect(page.getByLabel("Branch")).toHaveText("Test Branch");

    // Clean up so later runs of this test see the same baseline.
    await admin.from("branches").delete().eq("id", overflow.id);
    await admin.from("profiles").update({ home_branch_id: null }).eq("org_id", o.id).eq("role", "owner");
  });
});
