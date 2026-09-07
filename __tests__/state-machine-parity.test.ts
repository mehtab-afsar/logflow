/**
 * REPO GUARD — the TypeScript state machine must match the SQL one exactly.
 *
 * WHY: SQL is authoritative (the RPC re-reads consignment_transitions), but the
 * UI decides which buttons to show from the TS copy. If they drift, the app
 * offers an action the server will refuse — or hides one it would allow.
 */
import { TRANSITIONS, STATUSES, type Status, canTransition, nextForwardStatus, isTerminal } from "@/lib/consignments/state-machine";
import { loadMigrations } from "./helpers/migrations";

function sqlEdges(): Set<string> {
  const migration = loadMigrations().find((m) => m.file.includes("state_machine"));
  if (!migration) throw new Error("state machine migration not found");

  const block = /insert\s+into\s+public\.consignment_transitions[^;]*values([\s\S]*?);/i.exec(
    migration.sql,
  );
  if (!block) throw new Error("could not find the transitions seed INSERT");

  const edges = new Set<string>();
  for (const m of block[1].matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)) {
    edges.add(`${m[1]}->${m[2]}`);
  }
  return edges;
}

function tsEdges(): Set<string> {
  const edges = new Set<string>();
  for (const from of STATUSES) {
    for (const to of TRANSITIONS[from]) edges.add(`${from}->${to}`);
  }
  return edges;
}

describe("state machine parity between SQL and TypeScript", () => {
  const sql = sqlEdges();
  const ts = tsEdges();

  it("SQL declares a non-trivial edge set", () => {
    expect(sql.size).toBeGreaterThan(5);
  });

  it("every SQL edge exists in TypeScript", () => {
    expect([...sql].filter((e) => !ts.has(e)).sort()).toEqual([]);
  });

  it("every TypeScript edge exists in SQL", () => {
    expect([...ts].filter((e) => !sql.has(e)).sort()).toEqual([]);
  });
});

describe("state machine semantics", () => {
  it.each([
    ["draft", "dispatched"], ["dispatched", "in_transit"], ["in_transit", "delivered"],
    ["delivered", "pod_verified"], ["pod_verified", "invoiced"], ["invoiced", "settled"],
  ])("allows %s -> %s", (from, to) => {
    expect(canTransition(from as Status, to as Status)).toBe(true);
  });

  it.each([
    ["draft", "delivered"], ["pod_verified", "draft"], ["settled", "cancelled"],
    ["cancelled", "dispatched"], ["invoiced", "in_transit"], ["delivered", "dispatched"],
  ])("refuses %s -> %s", (from, to) => {
    expect(canTransition(from as Status, to as Status)).toBe(false);
  });

  it("every non-terminal status except invoiced-onward can be cancelled", () => {
    for (const s of ["draft", "dispatched", "in_transit", "delivered", "pod_verified", "invoiced"] as Status[]) {
      expect(canTransition(s, "cancelled")).toBe(true);
    }
  });

  it("settled cannot be cancelled — money has moved, use a credit note", () => {
    expect(canTransition("settled", "cancelled")).toBe(false);
  });

  it("settled and cancelled are terminal", () => {
    expect(isTerminal("settled")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("draft")).toBe(false);
  });

  it("the forward path walks draft to settled in six steps", () => {
    const path: Status[] = ["draft"];
    let cur: Status | null = "draft";
    while ((cur = nextForwardStatus(cur!))) path.push(cur);
    expect(path).toEqual([
      "draft", "dispatched", "in_transit", "delivered", "pod_verified", "invoiced", "settled",
    ]);
  });

  it("every status is reachable from draft", () => {
    const seen = new Set<Status>(["draft"]);
    const queue: Status[] = ["draft"];
    while (queue.length) {
      for (const next of TRANSITIONS[queue.pop()!]) {
        if (!seen.has(next)) { seen.add(next); queue.push(next); }
      }
    }
    expect([...STATUSES].filter((s) => !seen.has(s))).toEqual([]);
  });
});
