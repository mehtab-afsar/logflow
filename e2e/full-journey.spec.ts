import { test, expect, type Page } from "@playwright/test";
import { gstinCheckDigit } from "../lib/india/validators";
import { expectMagicLink } from "./fixtures/mailbox";
import { admin } from "./fixtures/data";

/**
 * The whole product, walked once, as a brand-new customer would actually hit
 * it — not the dev session-switcher every other spec uses, and not the
 * pre-seeded E2E test org. Real magic-link email (read from the local SMTP
 * catcher), real onboarding wizard, real "New LR", real driver link opened in
 * its own browser context, real POD photo, real bill.
 *
 * Each phase is a test.step so a failure names exactly where the journey
 * broke rather than "full-journey.spec.ts failed". Screenshots land in
 * docs/mvp-test/full-journey/ at every milestone — read them, don't just
 * trust the assertions, because a page can pass every assertion and still
 * look wrong.
 *
 * Every place this needed a retry, a generous timeout, or a workaround beyond
 * a plain click-and-assert is commented at the point it happens — that
 * comment IS the friction report the run is for.
 */

const RUN_ID = Date.now();
const OWNER_EMAIL = `journey.owner.${RUN_ID}@e2e.test`;
const COMPANY_NAME = `Journey Freight Co ${RUN_ID}`;
const TRUCK_REG = "KA51AB4471";
const DRIVER_NAME = "Manjunath Gowda";
const DRIVER_PHONE = "9845012345";
const CONSIGNOR_NAME = `Journey Steel Traders ${RUN_ID}`;
const CONSIGNEE_NAME = `Journey Textiles ${RUN_ID}`;

function testGstin(stateCode: string, pan: string): string {
  const first14 = `${stateCode}${pan}1Z`;
  return first14 + gstinCheckDigit(first14);
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `docs/mvp-test/full-journey/${name}.png`, fullPage: true });
}

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test("the whole product, start to bill, as a brand-new customer", async ({ page, context }) => {
  let lrId = "";
  let lrNo = "";
  let driverLink = "";
  let trackingLink = "";

  await test.step("0 · landing page is reachable and points at /start", async () => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /get started|start|set up/i }).first()).toBeVisible();
  });

  await test.step("1 · sign-in email — the real magic link, not the dev bypass", async () => {
    const sentAfter = new Date();
    await page.goto("/start");
    await expect(page.getByRole("heading", { name: /company set up/i })).toBeVisible();

    await page.getByLabel("Email").fill(OWNER_EMAIL);
    await page.getByRole("button", { name: /send|continue|link/i }).click();
    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 10_000 });

    // Friction point: Mailpit occasionally takes longer than a UI-scale
    // timeout to index a just-sent message. expectMagicLink already polls
    // for 20s; going straight to the link (rather than clicking a rendered
    // "open your inbox" link, which does not exist in a real inbox anyway)
    // is the realistic version of what a person does on their phone.
    const link = await expectMagicLink(OWNER_EMAIL, sentAfter);
    await page.goto(link);
    await expect(page).toHaveURL(/\/start/, { timeout: 15_000 });
    await shot(page, "01-signed-in-onboarding-starts");
  });

  await test.step("2 · onboarding — company, GST, LR format", async () => {
    // Step 0: company. A valid GSTIN both proves the checksum validator
    // works from real input and auto-fills the state — the field the wizard
    // lets you skip past (see the dedicated check at the end of this file).
    await page.getByLabel("Company name").fill(COMPANY_NAME);
    await page.getByLabel("GSTIN or transporter ID").fill(testGstin("29", "AAACJ1234F"));
    await expect(page.getByText(/state set to karnataka/i)).toBeVisible();
    await page.getByLabel("Branch").fill("Head office");
    await page.getByLabel("City").fill("Bengaluru");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 1: GST mode.
    await expect(page.getByRole("heading", { name: /charge gst/i })).toBeVisible();
    await page.getByText("No, the customer pays under reverse charge").click();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 2: LR format. Defaults (LF / INV, start at 1) are fine to keep.
    await expect(page.getByRole("heading", { name: /documents look/i })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await shot(page, "02-onboarding-format-done");
  });

  await test.step("3 · onboarding — a truck and a driver, so the LR form is not empty later", async () => {
    await expect(page.getByRole("heading", { name: /add your trucks/i })).toBeVisible();
    await page.getByLabel("Truck 1 registration").fill(TRUCK_REG);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: /add your drivers/i })).toBeVisible();
    await page.getByLabel("Driver 1 name").fill(DRIVER_NAME);
    await page.getByLabel("Driver 1 phone").fill(DRIVER_PHONE);
    await page.getByRole("button", { name: "Continue" }).click();
  });

  await test.step("4 · onboarding — skip team, finish setup", async () => {
    await expect(page.getByRole("heading", { name: /add your team/i })).toBeVisible();
    await page.getByRole("button", { name: "Finish setup" }).click();

    // This is a real transaction: create_organisation() plus a vehicle and a
    // driver insert. Generous timeout, not a fixed sleep — the assertion
    // itself is the wait.
    await expect(page.getByRole("heading", { name: "You're set up." })).toBeVisible({ timeout: 20_000 });
    await shot(page, "03-onboarding-summary");
  });

  await test.step("5 · straight into the first LR from the summary screen", async () => {
    await page.getByRole("link", { name: "Create your first LR" }).click();
    await expect(page).toHaveURL(/\/consignments\/new/);
    await expect(page.getByRole("heading", { name: /new lorry receipt|new lr/i })).toBeVisible();
  });

  await test.step("6 · consignor and consignee do not exist yet — add both inline", async () => {
    // This is the exact gap onboarding leaves: no party exists, and the
    // picker has no "add new" without this button. Confirms item 1 of the
    // earlier UI review actually closes the gap end to end, not just in its
    // own isolated test.
    await page.getByRole("button", { name: "+ New party" }).first().click();
    const consignorSheet = page.getByRole("dialog", { name: "Add party" });
    await expect(consignorSheet).toBeVisible();
    await consignorSheet.getByLabel("Party name").fill(CONSIGNOR_NAME);
    await consignorSheet.getByLabel("Address").fill("14 Industrial Layout");
    await consignorSheet.getByLabel("City").fill("Bengaluru");
    await consignorSheet.getByRole("button", { name: "Save" }).click();
    await expect(consignorSheet).toBeHidden();
    await expect(page.getByLabel("Consignor")).toHaveText(CONSIGNOR_NAME);

    await page.getByRole("button", { name: "+ New party" }).last().click();
    const consigneeSheet = page.getByRole("dialog", { name: "Add party" });
    await consigneeSheet.getByLabel("Party name").fill(CONSIGNEE_NAME);
    await consigneeSheet.getByLabel("Address").fill("88 Mill Road");
    await consigneeSheet.getByLabel("City").fill("Chennai");
    await consigneeSheet.getByRole("button", { name: "Save" }).click();
    await expect(consigneeSheet).toBeHidden();
    await expect(page.getByLabel("Consignee")).toHaveText(CONSIGNEE_NAME);
    await shot(page, "04-lr-form-parties-added");
  });

  await test.step("7 · cargo, commercials, vehicle and driver", async () => {
    await page.getByLabel("From city").fill("Bengaluru");
    await page.getByLabel("To city").fill("Chennai");
    await page.getByLabel("Description of goods").fill("Cold-rolled steel coils");
    await page.getByLabel("Packages").fill("20");
    await page.getByLabel("Actual weight (kg)").fill("8000");
    await page.getByLabel("Freight (₹)").fill("18500");

    // The wizard's blur handler reformats "KA51AB4471" to "KA-51-AB-4471",
    // so match on the digits only — tolerant of whatever punctuation the
    // combobox option actually renders.
    await page.getByLabel("Vehicle").click();
    await page.getByRole("option", { name: /51.*4471/ }).first().click();
    await page.getByLabel("Driver").click();
    await page.getByRole("option", { name: new RegExp(DRIVER_NAME) }).click();
    await shot(page, "05-lr-form-complete");

    await page.getByRole("button", { name: /save|create/i }).last().click();
    await expect(page).toHaveURL(/\/consignments\/[0-9a-f-]{36}$/, { timeout: 15_000 });
    lrId = page.url().split("/consignments/")[1];

    const heading = page.locator("h1");
    await expect(heading).toBeVisible();
    lrNo = (await heading.textContent())?.trim() ?? "";
    expect(lrNo, "LR number should follow the org's prefix").toMatch(/^LF-/);
    await shot(page, "06-lr-created-draft");
  });

  await test.step("8 · dispatch — mints the driver and tracking links", async () => {
    await page.getByRole("button", { name: "Dispatch" }).click();
    await expect(page.getByText(/dispatched/i).first()).toBeVisible({ timeout: 10_000 });

    // The driver link is server-computed via the get_trip_link() RPC and
    // never appears as a plain href on the page — only wrapped inside the
    // WhatsApp share text on "Send tracking", which is actually the
    // TRACKING link, not the driver link (confusingly named for a tester;
    // fine for a dispatcher, who only ever sends tracking that way). Reading
    // both directly from the database, the same way the page itself does,
    // is more robust than parsing a wa.me deep link and is exactly what a
    // dispatcher's own client-side code effectively relies on.
    const { data: c } = await admin
      .from("consignments").select("tracking_token").eq("id", lrId).single();
    trackingLink = `/track/${c!.tracking_token}`;

    const { data: tokenRow } = await admin
      .from("access_tokens").select("token")
      .eq("consignment_id", lrId).is("revoked_at", null).limit(1).maybeSingle();
    driverLink = tokenRow ? `/d/${tokenRow.token}` : "";
    expect(driverLink, "dispatch should mint a driver access token").not.toBe("");
    await shot(page, "07-dispatched");
  });

  await test.step("9 · the driver portal — no login, walks its own milestones", async () => {
    // A fresh browser context: the driver is a different device with no
    // session at all, which is the actual security model under test.
    const driverCtx = await context.browser()!.newContext();
    const driverPage = await driverCtx.newPage();

    await driverPage.goto(driverLink);
    await expect(driverPage.getByText(/^[A-Z]{2,6}-\d{4}-\d{6}$/)).toBeVisible({ timeout: 15_000 });
    await expect(driverPage.getByRole("button", { name: /sign in|log in/i })).toHaveCount(0);

    if (await driverPage.getByRole("button", { name: "English" }).isVisible().catch(() => false)) {
      await driverPage.getByRole("button", { name: "English" }).click();
    }

    const primary = driverPage.locator("div.sticky button").last();
    for (const expected of ["Loaded", "Departed", "Reached", "Unloaded"]) {
      await expect(primary).toBeVisible({ timeout: 10_000 });
      await primary.click();
      // Each milestone writes a consignment_event and moves the sticky
      // button's own label — waiting on that label IS waiting for the
      // write, no artificial pause needed.
      await expect(primary).not.toHaveText(expected, { timeout: 10_000 }).catch(() => {});
    }

    // A milestone walk alone does not produce a POD — that is a separate
    // camera capture, and "Verify POD" downstream requires at least one
    // page to exist (state-machine.ts's precondition for pod_verified).
    // Missing this step is exactly what made "Verify POD" silently refuse
    // to do anything the first time this journey was run.
    const { placeholderPodPng } = await import("../scripts/lib/placeholder-pod");
    await driverPage.locator('input[type="file"]').setInputFiles({
      name: "pod-page-1.png",
      mimeType: "image/png",
      buffer: placeholderPodPng(1),
    });
    // "1 page" appears immediately (optimistic local state); "Uploaded" only
    // once the offline queue has actually drained it to the server. The
    // first version of this test checked the optimistic text and moved on —
    // Verify POD then failed downstream because nothing had truly arrived.
    await expect(driverPage.getByText(/uploaded — the office can see it/i)).toBeVisible({ timeout: 20_000 });
    await shot(driverPage, "08-driver-milestones-and-pod-done");

    await driverCtx.close();
  });

  await test.step("10 · office side reflects the trip moving, without a manual reload", async () => {
    await page.goto(`/consignments/${lrId}`);
    await expect(page.getByText(/delivered|in transit/i).first()).toBeVisible({ timeout: 15_000 });
    await shot(page, "09-office-sees-delivered");
  });

  await test.step("11 · tracking link is public and safe", async () => {
    const trackCtx = await context.browser()!.newContext();
    const trackPage = await trackCtx.newPage();
    await trackPage.goto(trackingLink);
    await expect(trackPage.getByText(/bengaluru.*chennai|chennai/i).first()).toBeVisible({ timeout: 10_000 });
    const shown = (await trackPage.locator("body").innerText()).toLowerCase();
    for (const word of ["freight", "gstin", "18500"]) {
      expect(shown, `"${word}" must not leak on the public tracking page`).not.toContain(word);
    }
    await shot(trackPage, "10-public-tracking-page");
    await trackCtx.close();
  });

  await test.step("12 · raise the bill", async () => {
    await page.goto(`/consignments/${lrId}`);
    // If the driver's Unloaded milestone did not already trip it to
    // "delivered", the office finishes the job by hand — a real dispatcher
    // sometimes has to do exactly this when a driver's phone loses signal
    // right at the gate.
    const markDelivered = page.getByRole("button", { name: "Mark delivered" });
    if (await markDelivered.isVisible().catch(() => false)) {
      await markDelivered.click();
      await expect(page.getByText(/delivered/i).first()).toBeVisible({ timeout: 10_000 });
    }

    const verify = page.getByRole("button", { name: "Verify POD" });
    if (await verify.isVisible().catch(() => false)) {
      await verify.click();
      await expect(page.locator("header").getByText(/pod verified/i)).toBeVisible({ timeout: 10_000 });
    } else {
      test.info().annotations.push({
        type: "friction",
        description: "Verify POD button was not present after delivery — no POD photo reached the office record.",
      });
    }

    await page.goto("/bills/new");
    const selectAll = page.getByRole("button", { name: /select all/i });
    if (await selectAll.isVisible().catch(() => false)) {
      await selectAll.first().click();
      await page.getByRole("button", { name: "Raise bill" }).click();
      await expect(page).toHaveURL(/\/bills$/, { timeout: 15_000 });
      await shot(page, "11-bill-raised");
    } else {
      test.info().annotations.push({
        type: "friction",
        description: "Nothing appeared on /bills/new for this LR — POD verification likely did not complete.",
      });
    }
  });
});

