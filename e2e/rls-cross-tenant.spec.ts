import { test, expect } from "@playwright/test";

/**
 * Tenancy isolation, proven rather than assumed.
 *
 * Creates a genuinely separate organisation with its own user, then tries to
 * reach the seeded org's data from that session. Every attempt must fail, and
 * reads must fail as 404 rather than 403 — a 403 confirms the record exists,
 * which is itself a disclosure.
 */
import { admin, makeTrip } from "./fixtures/data";

const OUTSIDER = { email: "outsider@rivaltransport.test", password: "logiflow123" };

test.beforeAll(async () => {
  const { data: existing } = await admin
    .from("organisations").select("id").eq("legal_name", "Rival Transport Co").maybeSingle();

  if (existing) return;

  const { data: org } = await admin.from("organisations").insert({
    legal_name: "Rival Transport Co",
    gstin: "27AAPFU0939F1ZV",
    state_code: "27",
    tax_mode: "rcm",
  }).select("id").single();

  await admin.from("branches").insert({
    org_id: org!.id, name: "Pune", lr_prefix: "RV", inv_prefix: "RVI",
  });

  const { data: user, error } = await admin.auth.admin.createUser({
    email: OUTSIDER.email, password: OUTSIDER.password, email_confirm: true,
  });
  if (error || !user?.user) throw new Error(`could not create the outsider account: ${error?.message}`);

  await admin.from("profiles").insert({
    id: user.user.id, org_id: org!.id, full_name: "Rival Owner", role: "owner",
  });
});

test("another organisation's data is completely invisible", async ({ page }) => {
  // A consignment belonging to the seeded org, created here so the test does
  // not depend on what earlier runs left behind.
  const theirs = await makeTrip("pod_verified");

  // Become the outsider. There is no login screen; the dev session switcher
  // takes an explicit account so this test can act outside the demo org.
  const session = await page.request.get(
    `/api/dev/session?email=${encodeURIComponent(OUTSIDER.email)}&password=${encodeURIComponent(OUTSIDER.password)}`,
  );
  expect(session.status()).toBe(200);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });

  // The register is empty for this org.
  await page.goto("/consignments");
  await expect(page.getByText("No lorry receipts yet.")).toBeVisible();

  // Direct fetch by id: 404, never 403.
  const byId = await page.request.get(`/api/consignments/${theirs.id}`);
  expect(byId.status()).toBe(404);

  // Their LR number must not appear anywhere in this session.
  const list = await page.request.get("/api/consignments");
  expect(await list.text()).not.toContain(theirs.lr_no);

  // Transitioning someone else's consignment is a 404, not a permission hint.
  const move = await page.request.post(`/api/consignments/${theirs.id}/transition`, {
    data: { to_status: "invoiced" },
  });
  expect(move.status()).toBe(404);

  // A PDF of their LR is equally unreachable.
  const pdf = await page.request.get(`/api/consignments/${theirs.id}/lr.pdf`);
  expect(pdf.status()).toBe(404);
});

test("a public tracking token still works — it is scoped to one consignment, not an org", async ({ page }) => {
  const theirs = await makeTrip("in_transit");

  // Anyone holding the link may see the milestones. That is the point of it;
  // the projection is what keeps it safe.
  const res = await page.goto(`/track/${theirs.tracking_token}`);
  expect(res!.status()).toBe(200);
});
