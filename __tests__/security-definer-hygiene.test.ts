/**
 * REPO GUARD — SECURITY DEFINER functions must be locked down.
 *
 * WHY: two Supabase linter errors that are also real vulnerabilities.
 *
 *  1. Without `set search_path = ''`, a user who can create a schema on their
 *     own search_path can shadow `public.consignments` with their own table
 *     and hijack a definer function running as the owner.
 *
 *  2. Without an explicit REVOKE, PostgREST exposes the function to `anon`
 *     via the default grant to PUBLIC. Every RPC would be internet-callable.
 */
import { allSql } from "./helpers/migrations";

const sql = allSql();

interface Fn {
  name: string;
  signature: string;
  header: string;
}

function securityDefinerFunctions(): Fn[] {
  const out: Fn[] = [];
  const re =
    /create\s+(?:or\s+replace\s+)?function\s+(public\.[a-z_]+)\s*\(([^)]*)\)([\s\S]*?)as\s+\$\$/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const header = m[3];
    if (!/security\s+definer/i.test(header)) continue;
    out.push({ name: m[1], signature: m[2].trim(), header });
  }
  return out;
}

const fns = securityDefinerFunctions();

describe("security definer hygiene", () => {
  it("found security definer functions to check", () => {
    expect(fns.length).toBeGreaterThan(0);
  });

  it.each(fns.map((f) => [f.name, f] as const))("%s sets an empty search_path", (_n, fn) => {
    expect(fn.header).toMatch(/set\s+search_path\s*=\s*''/i);
  });

  it.each(fns.map((f) => [f.name, f] as const))("%s revokes execute from public", (_n, fn) => {
    const re = new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+${fn.name.replace(".", "\\.")}[^;]*from\\s+public`, "i");
    expect(re.test(sql)).toBe(true);
  });

  it("every schema-qualifiable call inside a definer body is qualified", () => {
    // gen_random_bytes is pgcrypto (extensions schema) — an unqualified call
    // fails at CALL time under search_path='', i.e. during a demo.
    const bad = [...sql.matchAll(/(?<!extensions\.)\bgen_random_bytes\s*\(/g)];
    expect(bad.map((b) => b[0])).toEqual([]);
  });

  it("gen_random_uuid is NOT schema-qualified (it is core, in pg_catalog)", () => {
    const bad = [...sql.matchAll(/extensions\.gen_random_uuid\s*\(/g)];
    expect(bad.map((b) => b[0])).toEqual([]);
  });
});
