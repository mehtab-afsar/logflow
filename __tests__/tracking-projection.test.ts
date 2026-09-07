/**
 * REPO GUARD — the public tracking page must never leak commercial data.
 *
 * WHY: a consignor forwards the tracking link to the consignee. If the
 * projection ever grows a freight or advance field, the customer sees what
 * their counterparty is paying, and both parties' GSTINs go out with it. That
 * is a business-ending mistake made by adding one line to a SELECT.
 *
 * So the whitelist lives here as data, and adding a key to the SQL without
 * adding it here fails the build.
 */
import { functionBody, allSql } from "./helpers/migrations";

const ALLOWED_KEYS = [
  "lr_no", "lr_date", "status", "from_city", "to_city",
  "vehicle_no", "driver_first_name", "eta_text", "pod_path", "events",
].sort();

/** Words that must never appear anywhere in the projection. */
const FORBIDDEN = [
  "freight", "advance", "gstin", "taxable", "invoice_total",
  "cgst", "sgst", "igst", "tax_amount", "amount", "expense",
  "phone", "mobile", "email", "declared_value", "bank",
];

const body = functionBody("track_consignment");

describe("public tracking projection", () => {
  it("the function exists in the migrations", () => {
    expect(body).not.toBeNull();
  });

  it.each(FORBIDDEN)("never mentions '%s'", (word) => {
    expect(body!.toLowerCase()).not.toContain(word);
  });

  it("exposes exactly the whitelisted top-level keys", () => {
    // Top-level keys are those in the outermost jsonb_build_object. Nested
    // event keys (at/status/kind/place/milestone) are deliberately excluded
    // by only taking keys that appear at the start of a line.
    const keys = [...body!.matchAll(/^\s{4}'([a-z_]+)',/gm)].map((m) => m[1]).sort();
    expect(keys).toEqual(ALLOWED_KEYS);
  });

  it("shows only the driver's first name", () => {
    expect(body).toContain("split_part(d.full_name, ' ', 1)");
    // A bare full_name reference anywhere else would defeat that.
    expect(body!.replace("split_part(d.full_name, ' ', 1)", "")).not.toContain("full_name");
  });

  it("hides draft consignments even from a valid token", () => {
    expect(body).toMatch(/c\.status\s*<>\s*'draft'/);
  });

  it("is STABLE, not VOLATILE (it must not be able to write)", () => {
    expect(body!.toLowerCase()).toContain("stable");
  });

  it("sets an empty search_path", () => {
    expect(body).toMatch(/set\s+search_path\s*=\s*''/);
  });

  it("is revoked from public before being granted to anon", () => {
    const sql = allSql();
    const revokeAt = sql.indexOf("revoke execute on function public.track_consignment(text) from public");
    const grantAt = sql.indexOf("grant  execute on function public.track_consignment(text) to anon");
    expect(revokeAt).toBeGreaterThan(-1);
    expect(grantAt).toBeGreaterThan(revokeAt);
  });
});

describe("driver portal projection", () => {
  const driverBody = functionBody("driver_trip");

  it("exists", () => {
    expect(driverBody).not.toBeNull();
  });

  it.each(["freight", "gstin", "advance", "taxable", "invoice_total", "cgst", "igst"])(
    "never shows the driver '%s'",
    (word) => {
      expect(driverBody!.toLowerCase()).not.toContain(word);
    },
  );

  it("does show what the driver needs to do the job", () => {
    for (const key of ["from_address", "to_address", "cargo", "vehicle_no", "instructions"]) {
      expect(driverBody).toContain(key);
    }
  });
});
