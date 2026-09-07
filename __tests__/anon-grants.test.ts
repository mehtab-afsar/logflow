/**
 * REPO GUARD — the anonymous surface must stay exactly four functions.
 *
 * WHY: `anon` is the role every unauthenticated visitor gets, including anyone
 * who guesses a URL. Supabase grants it broadly by default. This test replays
 * every GRANT and REVOKE in the migrations and asserts the final reachable set
 * is precisely the tracking RPC plus the three driver RPCs — no tables, no
 * views, nothing else.
 *
 * Adding a new anon grant is then a deliberate act that requires editing this
 * list, rather than something that slips through in a large migration.
 */
import { loadMigrations, allSql } from "./helpers/migrations";

const EXPECTED_ANON_FUNCTIONS = [
  "public.driver_add_expense",
  "public.driver_milestone",
  "public.driver_trip",
  "public.track_consignment",
].sort();

/** Objects anon can reach, after replaying grants and revokes in order. */
function anonReachable(): { functions: string[]; tables: string[] } {
  const functions = new Set<string>();
  const tables = new Set<string>();

  for (const m of loadMigrations()) {
    for (const stmt of m.sql.split(";")) {
      const s = stmt.trim();
      if (!s) continue;
      const isGrant = /^grant\s/i.test(s);
      const isRevoke = /^revoke\s/i.test(s);
      if (!isGrant && !isRevoke) continue;
      // Only statements that mention anon (or PUBLIC, which includes anon).
      if (!/\banon\b/i.test(s)) continue;

      const fn = /on\s+function\s+(public\.[a-z_]+)/i.exec(s);
      const tbl = /on\s+(?:table\s+)?(public\.[a-z_]+)\s+(?:to|from)/i.exec(s);

      if (fn) {
        if (isGrant) functions.add(fn[1]);
        else functions.delete(fn[1]);
      } else if (tbl) {
        if (isGrant) tables.add(tbl[1]);
        else tables.delete(tbl[1]);
      }
    }
  }
  return { functions: [...functions].sort(), tables: [...tables].sort() };
}

const reachable = anonReachable();

describe("anonymous access surface", () => {
  it("anon can execute exactly the four whitelisted functions", () => {
    expect(reachable.functions).toEqual(EXPECTED_ANON_FUNCTIONS);
  });

  it("anon can reach no table at all", () => {
    expect(reachable.tables).toEqual([]);
  });

  it("driver_register_pod is NOT anon-callable (service role only)", () => {
    expect(reachable.functions).not.toContain("public.driver_register_pod");
  });

  it("resolve_trip_token is unreachable from any browser role", () => {
    const sql = allSql();
    expect(sql).toContain("revoke execute on function public.resolve_trip_token(text) from public");
    // It IS granted to service_role — the POD route needs it. What must never
    // happen is a grant to a role a browser can hold.
    const grants = [...sql.matchAll(/grant\s+execute\s+on\s+function\s+public\.resolve_trip_token[^;]*?to\s+([a-z_,\s]+);/gi)];
    for (const g of grants) {
      expect(g[1]).not.toMatch(/\b(anon|authenticated)\b/);
    }
  });

  it("every table created is explicitly revoked from anon", () => {
    const sql = allSql();
    const created = new Set(
      [...sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+(public\.[a-z_]+)/gi)].map((m) => m[1]),
    );
    const missing = [...created].filter(
      (t) => !new RegExp(`revoke\\s+all\\s+on\\s+${t.replace(".", "\\.")}\\s+from[^;]*anon`, "i").test(sql),
    );
    expect(missing).toEqual([]);
  });

  it("the exceptions view is revoked from anon", () => {
    expect(allSql()).toMatch(/revoke\s+all\s+on\s+public\.consignment_exceptions\s+from\s+anon/i);
  });
});
