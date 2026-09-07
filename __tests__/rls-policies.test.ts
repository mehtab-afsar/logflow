/**
 * REPO GUARD — "RLS enabled" must mean "RLS enforced".
 *
 * WHY: enabling row level security on a table with no policy denies everyone,
 * which is safe. The dangerous case is the opposite: a table that was created
 * and never had RLS enabled at all, which Supabase then exposes through
 * PostgREST to every authenticated user in every organisation.
 *
 * This replays every CREATE/DROP POLICY across all migrations in filename
 * order to get the final live policy set, then asserts coverage.
 */
import { loadMigrations, allSql } from "./helpers/migrations";

/** RLS on, ZERO policies: unreachable from any browser role. Only SECURITY
 *  DEFINER functions and the service role touch these. */
const NO_POLICY_BY_DESIGN = new Set<string>([
  "public.access_tokens",
  "public.document_sequences",
  "public.consignment_transitions",
]);

/** Readable by the org, but writable only through a SECURITY DEFINER function.
 *  consignment_events is the audit trail: staff must be able to read the
 *  timeline, and nobody may forge or erase a row. */
const READ_ONLY_BY_DESIGN = new Set<string>(["public.consignment_events"]);

interface Policy {
  key: string;
  table: string;
  name: string;
  body: string;
}

function livePolicies(): Map<string, Policy> {
  const live = new Map<string, Policy>();

  for (const m of loadMigrations()) {
    // Walk statements in source order so a drop later in the same file wins.
    const stmts = m.sql.split(";");
    for (const stmt of stmts) {
      const drop = /drop\s+policy\s+if\s+exists\s+"([^"]+)"\s+on\s+([a-z_.]+)/i.exec(stmt);
      if (drop) {
        live.delete(`${drop[2]}.${drop[1]}`);
        continue;
      }
      const create = /create\s+policy\s+"([^"]+)"\s+on\s+([a-z_.]+)([\s\S]*)/i.exec(stmt);
      if (create) {
        const key = `${create[2]}.${create[1]}`;
        live.set(key, { key, table: create[2], name: create[1], body: create[3] });
      }
    }
  }
  return live;
}

function createdTables(): string[] {
  const found = new Set<string>();
  for (const m of loadMigrations()) {
    for (const x of m.sql.matchAll(/create\s+table\s+if\s+not\s+exists\s+(public\.[a-z_]+)/gi)) {
      found.add(x[1].toLowerCase());
    }
  }
  return [...found].sort();
}

const tables = createdTables();
const policies = livePolicies();
const sql = allSql();

describe("row level security", () => {
  it("found tables and policies to check", () => {
    expect(tables.length).toBeGreaterThan(0);
    expect(policies.size).toBeGreaterThan(0);
  });

  it.each(tables)("%s has RLS enabled", (table) => {
    const re = new RegExp(`alter\\s+table\\s+${table.replace(".", "\\.")}\\s+enable\\s+row\\s+level\\s+security`, "i");
    expect(re.test(sql)).toBe(true);
  });

  it.each(tables)("%s has at least one policy, or is deny-all by design", (table) => {
    const own = [...policies.values()].filter((p) => p.table === table);
    if (NO_POLICY_BY_DESIGN.has(table)) {
      expect(own).toHaveLength(0);
      return;
    }
    if (READ_ONLY_BY_DESIGN.has(table)) {
      // Exactly one policy, and it must be SELECT-only.
      expect(own).toHaveLength(1);
      expect(own[0].body).toMatch(/for\s+select/i);
      return;
    }
    expect(own.length).toBeGreaterThan(0);
  });

  it.each(tables)("%s revokes all from anon", (table) => {
    const re = new RegExp(`revoke\\s+all\\s+on\\s+${table.replace(".", "\\.")}\\s+from[^;]*anon`, "i");
    expect(re.test(sql)).toBe(true);
  });

  it.each([...policies.values()].map((p) => [p.key, p] as const))(
    "policy %s is scoped to a role and to the caller's org",
    (_key, policy) => {
      // Never a bare `using (true)` — that is org-wide (or worse) exposure.
      expect(policy.body).not.toMatch(/using\s*\(\s*true\s*\)/i);
      // Must be addressed to a role, not PUBLIC.
      expect(policy.body).toMatch(/\bto\s+(authenticated|anon|service_role)\b/i);
      // Must constrain rows by tenancy or by the caller's own id.
      expect(policy.body).toMatch(/current_org_id\(\)|auth\.uid\(\)/i);
    },
  );

  it("read-only tables revoke every write verb from authenticated", () => {
    for (const table of READ_ONLY_BY_DESIGN) {
      const re = new RegExp(
        `revoke\\s+insert,\\s*update,\\s*delete\\s+on\\s+${table.replace(".", "\\.")}\\s+from[^;]*authenticated`,
        "i",
      );
      expect({ table, revoked: re.test(sql) }).toMatchObject({ revoked: true });
    }
  });

  it("deny-all-by-design tables also revoke from authenticated", () => {
    for (const table of NO_POLICY_BY_DESIGN) {
      if (!tables.includes(table)) continue; // not created yet
      const re = new RegExp(`revoke[^;]*on\\s+${table.replace(".", "\\.")}\\s+from[^;]*authenticated`, "i");
      expect({ table, revoked: re.test(sql) }).toMatchObject({ revoked: true });
    }
  });
});
