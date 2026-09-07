import { test, expect } from "@playwright/test";
import { signIn } from "./fixtures/auth";
import { admin } from "./fixtures/data";

const unique = () => Math.random().toString(36).slice(2, 8).toUpperCase();

test.describe("masters", () => {
  test("adds a vehicle and it becomes assignable on an LR", async ({ page }) => {
    const reg = `KA-09-ZZ-${Math.floor(1000 + Math.random() * 8999)}`;

    await signIn(page, "dispatcher");
    await page.goto("/fleet");

    await page.getByRole("button", { name: "Add vehicle" }).click();
    await page.getByLabel("Registration number").fill(reg);
    await page.getByLabel("Type").click();
    await page.getByRole("option", { name: "22ft" }).click();
    await page.getByLabel("Capacity (tonnes)").fill("9");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText(reg)).toBeVisible({ timeout: 15_000 });

    // The point of a master: it must be usable on a lorry receipt immediately.
    await page.goto("/consignments/new");
    await expect(page.getByLabel("Vehicle").locator(`option:has-text("${reg}")`)).toHaveCount(1);
  });

  test("rejects a malformed registration with a useful message", async ({ page }) => {
    await signIn(page, "dispatcher");
    await page.goto("/fleet");

    await page.getByRole("button", { name: "Add vehicle" }).click();
    await page.getByLabel("Registration number").fill("NOTAREG");
    await page.getByLabel("Type").click();
    await page.getByRole("option", { name: "22ft" }).click();
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText(/not a valid registration/i)).toBeVisible();
  });

  test("rejects a GSTIN that fails its check digit", async ({ page }) => {
    await signIn(page, "dispatcher");
    await page.goto("/parties");

    await page.getByRole("button", { name: "Add party" }).click();
    await page.getByLabel("Party name").fill(`Checksum Test ${unique()}`);
    await page.getByLabel("Address").fill("Plot 1");
    await page.getByLabel("City").fill("Pune");
    // Correct shape, wrong check digit — a regex would let this through.
    await page.getByLabel("GSTIN").fill("27AAPFU0939F1ZZ");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText(/GSTIN is not valid/i)).toBeVisible();
  });

  test("derives the party's state from its GSTIN", async ({ page }) => {
    const name = `State Derivation ${unique()}`;

    await signIn(page, "dispatcher");
    await page.goto("/parties");

    await page.getByRole("button", { name: "Add party" }).click();
    await page.getByLabel("Party name").fill(name);
    await page.getByLabel("Address").fill("Plot 1, MIDC");
    await page.getByLabel("City").fill("Pune");
    await page.getByLabel("GSTIN").fill("27AAPFU0939F1ZV"); // 27 = Maharashtra
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });

    const { data } = await admin
      .from("parties").select("state_code").eq("name", name).single();
    expect(data!.state_code).toBe("27");
  });

  test("edits a driver", async ({ page }) => {
    const phone = `98${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    const name = `Edit Test ${unique()}`;

    await signIn(page, "dispatcher");
    await page.goto("/fleet");

    await page.getByRole("button", { name: "Add driver" }).click();
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Mobile").fill(phone);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("row", { name: new RegExp(name) }).getByLabel("Edit driver").click();
    await page.getByLabel("Name").fill(`${name} Updated`);
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText(`${name} Updated`)).toBeVisible({ timeout: 15_000 });
  });

  test("refuses a duplicate vehicle registration, however it is spelled", async ({ page }) => {
    const reg = `KA-08-YY-${Math.floor(1000 + Math.random() * 8999)}`;

    await signIn(page, "dispatcher");
    const first = await page.request.post("/api/vehicles", {
      data: { reg_number: reg, vehicle_type: "22ft", ownership: "own" },
    });
    expect(first.status()).toBe(201);

    // Same number, different separators — the unique index normalises.
    const second = await page.request.post("/api/vehicles", {
      data: { reg_number: reg.replace(/-/g, " ").toLowerCase(), vehicle_type: "22ft", ownership: "own" },
    });
    expect(second.status()).toBe(409);
    expect((await second.json()).error).toMatch(/already on your fleet/i);
  });

  test("a viewer cannot add or remove masters", async ({ page }) => {
    await signIn(page, "viewer");

    const create = await page.request.post("/api/drivers", {
      data: { full_name: "Should Fail", phone: "9800000001", language: "hi" },
    });
    expect(create.status()).toBe(403);

    // And the UI does not offer the action.
    await page.goto("/fleet");
    await expect(page.getByRole("button", { name: "Add vehicle" })).toHaveCount(0);
  });

  test("only the owner may remove, and removal is soft", async ({ page }) => {
    await signIn(page, "dispatcher");
    const created = await page.request.post("/api/drivers", {
      data: { full_name: `Soft Delete ${unique()}`, phone: `97${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, language: "hi" },
    });
    const id = (await created.json()).data.id;

    // A dispatcher may write but not remove.
    const asDispatcher = await page.request.delete(`/api/drivers/${id}`);
    expect(asDispatcher.status()).toBe(403);

    await signIn(page, "owner");
    const asOwner = await page.request.delete(`/api/drivers/${id}`);
    expect(asOwner.status()).toBe(200);

    // The row survives, so lorry receipts keep their reference.
    const { data } = await admin.from("drivers").select("id, deleted_at").eq("id", id).single();
    expect(data!.deleted_at).not.toBeNull();
  });
});

test("a party added through the UI can immediately be used on an LR", async ({ page }) => {
  // Regression: the party form originally collected no address, so the LR form
  // — which falls back to the party's city for the route — failed with
  // "origin city is required" on any newly added party.
  const name = `Usable Party ${unique()}`;

  await signIn(page, "dispatcher");
  await page.goto("/parties");
  await page.getByRole("button", { name: "Add party" }).click();
  await page.getByLabel("Party name").fill(name);
  await page.getByLabel("Address").fill("Plot 9, Industrial Estate");
  await page.getByLabel("City").fill("Mysuru");
  await page.getByLabel("GSTIN").fill("29AAGCB1286Q1Z0");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });

  const { data: party } = await admin
    .from("parties").select("id").eq("name", name).single();

  await page.goto("/consignments/new");
  await page.getByLabel("Consignor").selectOption(party!.id);
  await page.getByLabel("Consignee").selectOption({ index: 1 });
  await page.getByLabel("Description of goods").fill("Regression cargo");
  await page.getByLabel("Freight (₹)", { exact: true }).fill("15000");
  await page.getByRole("button", { name: "Save draft" }).click();

  await expect(page).toHaveURL(/\/consignments\/[0-9a-f-]{36}/, { timeout: 20_000 });
});
