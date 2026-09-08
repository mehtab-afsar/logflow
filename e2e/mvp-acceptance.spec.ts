import { test, expect, type Page } from "@playwright/test";
import { signIn, pickCombobox } from "./fixtures/auth";
import { admin, testOrg } from "./fixtures/data";

/**
 * MVP ACCEPTANCE TEST
 *
 * Not a feature test. This walks the product the way a transporter would, in
 * one unbroken run, and asks whether the promise holds: masters → lorry
 * receipt → dispatch → driver POD from a phone with no signal → verify → bill →
 * Tally CSV.
 *
 * It then checks the things that must NOT happen, and finally the realities of
 * demo day — page timings, no console errors, tracking with JavaScript off.
 *
 * Everything is provisioned in the suite's own organisation, so it can be run
 * repeatedly without touching the demo data.
 */

const stamp = () => Math.random().toString(36).slice(2, 7).toUpperCase();
const findings: string[] = [];

/** Records a non-fatal observation without failing the run. */
function note(msg: string) {
  findings.push(msg);
  console.log(`>> NOTE  ${msg}`);
}
function metric(label: string, value: string) {
  console.log(`>> ${label.padEnd(34)} ${value}`);
}

test.describe.configure({ mode: "serial" });

/* ══════════════════════════════════════════════════════════════════════
   JOURNEY 1 — the money loop
   ══════════════════════════════════════════════════════════════════════ */

test.describe("Journey 1 · from empty masters to a Tally CSV", () => {
  const id = stamp();
  const party = `Acceptance Consignor ${id}`;
  const reg = `KA-77-AT-${Math.floor(1000 + Math.random() * 8999)}`;
  const driverName = `Acceptance Driver ${id}`;
  const phone = `96${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  let lrNo = "";
  let lrId = "";

  test("1.1 a dispatcher adds a party, a truck and a driver", async ({ page }) => {
    await signIn(page, "dispatcher");

    await page.goto("/parties");
    await page.getByRole("button", { name: "Add party" }).click();
    await page.getByLabel("Party name").fill(party);
    await page.getByLabel("Address").fill("Plot 12, Peenya Industrial Area");
    await page.getByLabel("City").fill("Bengaluru");
    await page.getByLabel("GSTIN").fill("29AAGCB1286Q1Z0");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(party)).toBeVisible({ timeout: 15_000 });

    await page.goto("/fleet");
    await page.getByRole("button", { name: "Add vehicle" }).click();
    await page.getByLabel("Registration number").fill(reg);
    await page.getByLabel("Type").click();
    await page.getByRole("option", { name: "32ft MXL" }).click();
    await page.getByLabel("Capacity (tonnes)").fill("21");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(reg)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Add driver" }).click();
    await page.getByLabel("Name").fill(driverName);
    await page.getByLabel("Mobile").fill(phone);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(driverName)).toBeVisible({ timeout: 15_000 });

    // The state must be derived from the GSTIN, not asked for.
    const { data } = await admin.from("parties").select("state_code").eq("name", party).single();
    expect(data!.state_code, "state derived from GSTIN").toBe("29");
  });

  test("1.2 writes a lorry receipt with them, in under a minute", async ({ page }) => {
    await signIn(page, "dispatcher");

    const t0 = Date.now();
    await page.goto("/consignments/new");
    await pickCombobox(page, "Consignor", party);
    await pickCombobox(page, "Consignee", "Test Consignee");
    await page.getByLabel("Description of goods").fill("HDPE granules");
    await page.getByLabel("Packages", { exact: true }).fill("240");
    await page.getByLabel("Actual weight (kg)").fill("18000");
    await page.getByLabel("Charged weight (kg)").fill("18000");
    await page.getByLabel("Declared value (₹)").fill("980000");
    await page.getByLabel("E-way bill no.").fill("341267890123");
    await page.getByLabel("Freight (₹)", { exact: true }).fill("42000");
    await page.getByLabel("Loading (₹)", { exact: true }).fill("1500");
    await pickCombobox(page, "Vehicle", reg);
    await pickCombobox(page, "Driver", driverName);

    // The live preview must agree with the tax engine before saving.
    await expect(page.getByText("₹43,500.00").first()).toBeVisible();

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/consignments\/[0-9a-f-]{36}/, { timeout: 20_000 });
    metric("LR written in", `${((Date.now() - t0) / 1000).toFixed(1)}s`);

    lrNo = (await page.locator("h1").textContent())!.trim();
    lrId = page.url().split("/").pop()!;
    expect(lrNo).toMatch(/^[A-Z]{2,6}-\d{4}-\d{6}$/);
    metric("LR number", lrNo);
  });

  test("1.3 the printed LR is a real four-copy PDF", async ({ page }) => {
    await signIn(page);
    const res = await page.request.get(`/api/consignments/${lrId}/lr.pdf`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");

    const body = await res.body();
    expect(body.subarray(0, 5).toString(), "PDF magic bytes").toBe("%PDF-");
    metric("LR PDF size", `${Math.round(body.length / 1024)} KB`);

    // Four copies means four pages.
    const pages = (body.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages, "consignor, consignee, driver and office copies").toBe(4);

    // Second fetch must come from the cache, not re-render.
    const again = await page.request.get(`/api/consignments/${lrId}/lr.pdf`);
    expect(again.headers()["x-pdf-cache"]).toBe("hit");
  });

  test("1.4 dispatch mints the driver link and records the advance", async ({ page }) => {
    await signIn(page, "dispatcher");
    await page.goto(`/consignments/${lrId}`);
    await page.getByRole("button", { name: "Dispatch" }).click();
    await expect(page.locator("header").getByText("Dispatched")).toBeVisible({ timeout: 15_000 });

    const { data: tok } = await admin
      .from("access_tokens").select("token").eq("consignment_id", lrId).limit(1).maybeSingle();
    expect(tok?.token, "driver link minted on dispatch").toBeTruthy();
  });

  test("1.5 the driver works the trip on a phone, including with no signal", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    });
    const page = await ctx.newPage();

    const { data: tok } = await admin
      .from("access_tokens").select("token").eq("consignment_id", lrId).limit(1).single();

    await page.goto(`/d/${tok!.token}`);
    await expect(page.getByText(/^[A-Z]{2,6}-\d{4}-\d{6}$/)).toBeVisible({ timeout: 20_000 });

    // No login anywhere on the driver's screen.
    await expect(page.getByRole("button", { name: /sign in|log in/i })).toHaveCount(0);

    await page.getByRole("button", { name: "English" }).click();
    const primary = page.locator("div.sticky button").last();

    // Loaded, with signal.
    await expect(primary).toHaveText("Loaded");
    await primary.click();
    await expect(primary).toHaveText("Departed", { timeout: 10_000 });

    // Now the part that matters: no network at the gate.
    await ctx.setOffline(true);
    await primary.click();
    await expect(page.getByText(/saved on your phone|No signal/i)).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "docs/mvp-test/driver-offline.png" });

    await ctx.setOffline(false);
    await expect(page.getByText(/saved on your phone|No signal/i)).toBeHidden({ timeout: 40_000 });

    await expect
      .poll(async () => {
        const { count } = await admin
          .from("consignment_events").select("id", { count: "exact", head: true })
          .eq("consignment_id", lrId).eq("kind", "milestone");
        return count ?? 0;
      }, { timeout: 30_000 })
      .toBeGreaterThanOrEqual(2);

    await ctx.close();
  });

  test("1.6 the office verifies the POD and raises a bill", async ({ page }) => {
    // Walk the trip to delivered with a POD, as the driver's upload would.
    await admin.rpc("_apply_transition", {
      p_consignment_id: lrId, p_to_status: "delivered",
      p_payload: { force: "true" } as never, p_event_time: new Date().toISOString(),
      p_actor_type: "system", p_actor_user_id: null as unknown as string,
    });
    const o = await testOrg();
    const clientId = crypto.randomUUID();
    const { placeholderPodPng } = await import("../scripts/lib/placeholder-pod");
    const path = `${o.id}/${lrId}/${clientId}.png`;
    await admin.storage.from("pods").upload(path, placeholderPodPng(3), { contentType: "image/png", upsert: true });
    await admin.from("consignment_pods").insert({
      org_id: o.id, consignment_id: lrId, page_no: 1, storage_path: path,
      client_id: clientId, uploaded_by_type: "driver",
    });

    await signIn(page, "accounts");
    await page.goto(`/consignments/${lrId}`);
    await page.getByRole("button", { name: "Verify POD" }).click();
    await expect(page.locator("header").getByText("POD verified")).toBeVisible({ timeout: 15_000 });

    await page.goto("/bills/new");
    await page.getByRole("button", { name: "Select all for one consignor" }).click();
    await page.getByRole("button", { name: "Raise bill" }).click();
    await expect(page).toHaveURL(/\/bills$/, { timeout: 20_000 });

    const { data: bill } = await admin
      .from("freight_bills").select("id, bill_no, taxable_value, total_amount")
      .eq("org_id", o.id).order("created_at", { ascending: false }).limit(1).single();
    metric("bill raised", bill!.bill_no);

    // The bill total must reconcile with its own parts.
    const { data: lines } = await admin
      .from("bill_lines").select("amount").eq("bill_id", bill!.id);
    const sum = (lines ?? []).reduce((s, l) => s + Number(l.amount), 0);
    expect(Number(bill!.taxable_value), "taxable value equals the sum of its lines").toBeCloseTo(sum, 2);

    const csv = await page.request.get(`/api/bills/${bill!.id}/tally.csv`);
    expect(csv.status()).toBe(200);
    const text = await csv.text();
    expect(text.charCodeAt(0), "UTF-8 BOM for Tally on Windows").toBe(0xfeff);
    expect(text).toContain("\r\n");
    expect(text).toContain(bill!.bill_no);

    const pdf = await page.request.get(`/api/bills/${bill!.id}/invoice.pdf`);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  });
});

/* ══════════════════════════════════════════════════════════════════════
   JOURNEY 2 — what must not happen
   ══════════════════════════════════════════════════════════════════════ */

test.describe("Journey 2 · the things that must never happen", () => {
  test("2.1 the tracking link gives away nothing commercial", async ({ page }) => {
    const { makeTrip } = await import("./fixtures/data");
    const trip = await makeTrip("in_transit");
    const { data: c } = await admin
      .from("consignments")
      .select("freight, invoice_total, consignor_snapshot, drivers(full_name)")
      .eq("id", trip.id).single();

    await page.goto(`/track/${trip.tracking_token}`);
    // innerText, not textContent: textContent includes the contents of inline
    // <script> tags — in development that is the whole RSC payload — so it is
    // not "what a person can read", and scanning it produced false alarms.
    const shown = await page.locator("body").innerText();
    const lower = shown.toLowerCase();

    // Asserted on RENDERED TEXT, not raw HTML. The 40-character hex tracking
    // token appears in the markup and can, by chance, contain a ten-digit run
    // beginning 6-9 — which looks exactly like an Indian mobile number to a
    // regex. Scanning the HTML made this test fail at random on a token, not
    // on a leak. What matters is what a person can actually read.
    for (const word of ["freight", "advance", "gstin", "taxable", "cgst", "igst", "expense"]) {
      expect(lower, `"${word}" must not be shown`).not.toContain(word);
    }
    expect(shown, "the freight amount").not.toContain(String(Math.round(Number(c!.freight))));
    expect(shown, "any GSTIN").not.toMatch(/[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z/);
    expect(shown, "any mobile number").not.toMatch(/(^|[^0-9])[6-9][0-9]{9}([^0-9]|$)/);

    // And the consignor's actual GSTIN, by value, anywhere in the document.
    const gstin = (c!.consignor_snapshot as { gstin?: string })?.gstin;
    if (gstin) expect(await page.content()).not.toContain(gstin);

    const full = (c!.drivers as unknown as { full_name: string }).full_name;
    const [first, ...rest] = full.split(" ");
    expect(lower, "driver's first name is shown").toContain(first.toLowerCase());
    if (rest.length) {
      expect(lower, "driver's surname is withheld").not.toContain(rest.join(" ").toLowerCase());
    }
  });

  test("2.2 a viewer cannot raise a bill, and is not offered the button", async ({ page }) => {
    await signIn(page, "viewer");
    const res = await page.request.post("/api/bills", {
      data: {
        branch_id: "00000000-0000-0000-0000-000000000000",
        consignor_party_id: "00000000-0000-0000-0000-000000000000",
        consignment_ids: ["00000000-0000-0000-0000-000000000000"],
      },
    });
    expect(res.status()).toBe(403);

    await page.goto("/fleet");
    await expect(page.getByRole("button", { name: "Add vehicle" })).toHaveCount(0);
  });

  test("2.3 a consignment cannot be dispatched without a truck and driver", async ({ page }) => {
    const { makeTrip } = await import("./fixtures/data");
    const trip = await makeTrip("draft");
    await admin.from("consignments").update({ vehicle_id: null, driver_id: null }).eq("id", trip.id);

    await signIn(page, "dispatcher");
    await page.goto(`/consignments/${trip.id}`);
    await page.getByRole("button", { name: "Dispatch" }).click();
    await expect(page.locator("[data-sonner-toast]"))
      .toContainText(/vehicle and a driver are required/i, { timeout: 15_000 });
  });

  test("2.4 a consignment cannot be billed twice", async ({ page }) => {
    await signIn(page, "accounts");
    const o = await testOrg();
    const { data: line } = await admin
      .from("bill_lines").select("consignment_id, freight_bills!inner(org_id)")
      .eq("freight_bills.org_id", o.id).limit(1).single();
    const { data: c } = await admin
      .from("consignments").select("branch_id, consignor_party_id").eq("id", line!.consignment_id).single();

    const res = await page.request.post("/api/bills", {
      data: {
        branch_id: c!.branch_id,
        consignor_party_id: c!.consignor_party_id,
        consignment_ids: [line!.consignment_id],
      },
    });
    expect(res.status()).toBe(409);
  });

  test("2.5 a revoked driver link stops working immediately", async ({ request }) => {
    const { makeTrip } = await import("./fixtures/data");
    const trip = await makeTrip("dispatched");
    expect((await request.get(`/api/d/${trip.driverToken}/trip`)).status()).toBe(200);

    await admin.from("access_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token", trip.driverToken);

    expect((await request.get(`/api/d/${trip.driverToken}/trip`)).status()).toBe(410);
  });

  test("2.6 the API refuses an unauthenticated caller", async ({ request }) => {
    for (const path of ["/api/consignments", "/api/bills", "/api/vehicles", "/api/drivers"]) {
      expect({ path, status: (await request.get(path)).status() }).toMatchObject({ status: 401 });
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════
   JOURNEY 3 — demo-day realities
   ══════════════════════════════════════════════════════════════════════ */

test.describe("Journey 3 · would this survive a demo", () => {
  test("3.1 every screen loads without a console error or a failed request", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 140)}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 400) problems.push(`${r.status()}: ${r.url()}`);
    });
    page.on("requestfailed", (r) => problems.push(`failed: ${r.url()}`));

    await signIn(page);
    const timings: Record<string, number> = {};
    for (const path of ["/dashboard", "/consignments", "/bills", "/fleet", "/parties", "/settings", "/consignments/new"]) {
      const t0 = Date.now();
      await page.goto(path, { waitUntil: "networkidle" });
      timings[path] = Date.now() - t0;
    }
    for (const [p, ms] of Object.entries(timings)) metric(`load ${p}`, `${ms} ms`);

    // HMR websocket noise is development-only and not a product fault.
    const real = problems.filter((p) => !/_next\/hmr|react-devtools|preloaded using link preload/i.test(p));
    if (real.length) real.forEach((p) => note(`console/network: ${p}`));
    expect(real, "no console errors or failed requests").toEqual([]);
  });

  test("3.2 the customer's tracking page works with JavaScript disabled", async ({ browser }) => {
    const { makeTrip } = await import("./fixtures/data");
    const trip = await makeTrip("delivered");

    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto(`/track/${trip.tracking_token}`);
    metric("tracking page, JS off", `${Date.now() - t0} ms`);

    await expect(page.getByText(trip.lr_no)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Progress" })).toBeVisible();
    await page.screenshot({ path: "docs/mvp-test/tracking-nojs.png", fullPage: true });
    await ctx.close();
  });

  test("3.3 an unknown link fails politely, not with a stack trace", async ({ page }) => {
    const res = await page.goto("/track/0000000000000000000000000000000000000000");
    expect(res!.status()).toBe(404);

    // What the visitor reads must be the friendly page. innerText, not
    // textContent, for the same reason as 2.1.
    const shown = await page.locator("body").innerText();
    expect(shown).toContain("This tracking link");
    expect(shown).toContain("check with your transporter");

    // A stack trace must not be VISIBLE. It is deliberately not asserted
    // against the raw HTML: in development Next embeds an RSC error payload
    // carrying local file paths, which does not exist in a production build.
    // Asserting on the markup here would fail every dev run and prove nothing
    // about what ships.
    expect(shown).not.toMatch(/at Object\.|node_modules|\.tsx:\d+/);
  });

  test("3.4 summary", async () => {
    console.log(`\n>> ${findings.length} observation(s) recorded`);
    findings.forEach((f) => console.log(`>>   · ${f}`));
  });
});
