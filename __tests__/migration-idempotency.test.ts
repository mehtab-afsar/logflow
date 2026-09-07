/**
 * REPO GUARD — migrations must be safely re-runnable.
 *
 * WHY: a migration batch that fails halfway leaves history half-applied. The
 * next `db push` then re-runs statements that already succeeded. If any of
 * them is not idempotent, the database is stuck in a state no one can fix
 * without hand-editing the migration history table.
 *
 * The `add constraint` rule is the important one: unlike `add column` and
 * `create table`, PostgreSQL 17 has NO `ALTER TABLE ... ADD CONSTRAINT
 * IF NOT EXISTS`. It must be wrapped in a pg_constraint existence check.
 */
import { loadMigrations } from "./helpers/migrations";

const migrations = loadMigrations();

describe("migrations are idempotent", () => {
  it("has at least one migration to check", () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it.each(migrations.map((m) => [m.file, m] as const))(
    "%s: create table / index / schema use IF NOT EXISTS",
    (_file, m) => {
      const offenders: string[] = [];

      const creates = m.sql.matchAll(
        /create\s+(unique\s+)?(table|index|schema)\s+(?!if\s+not\s+exists)([a-z_."]+)/gi,
      );
      for (const c of creates) {
        // `create index concurrently` and `create table as` are not used here;
        // anything else without IF NOT EXISTS is a genuine offender.
        offenders.push(c[0].trim());
      }

      expect(offenders).toEqual([]);
    },
  );

  it.each(migrations.map((m) => [m.file, m] as const))(
    "%s: every CREATE POLICY is preceded by DROP POLICY IF EXISTS",
    (_file, m) => {
      const created = [...m.sql.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+([a-z_.]+)/gi)].map(
        (x) => `${x[2]}.${x[1]}`,
      );
      const dropped = new Set(
        [...m.sql.matchAll(/drop\s+policy\s+if\s+exists\s+"([^"]+)"\s+on\s+([a-z_.]+)/gi)].map(
          (x) => `${x[2]}.${x[1]}`,
        ),
      );

      const missing = created.filter((p) => !dropped.has(p));
      expect(missing).toEqual([]);
    },
  );

  it.each(migrations.map((m) => [m.file, m] as const))(
    "%s: every CREATE TRIGGER is preceded by DROP TRIGGER IF EXISTS",
    (_file, m) => {
      const created = [...m.sql.matchAll(/create\s+trigger\s+([a-z_]+)/gi)].map((x) => x[1]);
      const dropped = new Set(
        [...m.sql.matchAll(/drop\s+trigger\s+if\s+exists\s+([a-z_]+)/gi)].map((x) => x[1]),
      );

      const missing = created.filter((t) => !dropped.has(t));
      expect(missing).toEqual([]);
    },
  );

  it.each(migrations.map((m) => [m.file, m] as const))(
    "%s: ALTER TABLE ... ADD CONSTRAINT is guarded (PG17 has no IF NOT EXISTS for it)",
    (_file, m) => {
      const addConstraints = [...m.sql.matchAll(/alter\s+table\s+[^;]*?add\s+constraint/gi)];
      if (addConstraints.length === 0) return;

      // Each one must sit inside a DO block that checks pg_constraint.
      for (const match of addConstraints) {
        const before = m.sql.slice(0, match.index);
        const lastDo = before.lastIndexOf("do $$");
        const lastEnd = before.lastIndexOf("end $$");
        const insideDoBlock = lastDo > lastEnd;
        const guarded = insideDoBlock && before.slice(lastDo).includes("pg_constraint");

        expect({ file: _file, stmt: match[0].trim(), guarded }).toMatchObject({ guarded: true });
      }
    },
  );
});
