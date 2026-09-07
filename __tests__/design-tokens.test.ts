/**
 * REPO GUARD — status must never be communicated by colour alone, and colour
 * must come from the token file.
 *
 * WHY: PRD §8.2 — "status is colour, colour is only status". A colour-only
 * status fails for a colourblind dispatcher and disappears entirely on the
 * photocopied LR that goes in the file. And once hex values start appearing
 * inline, the palette stops being changeable.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { STATUS_TOKENS, expiryTone } from "@/lib/design/tokens";
import { STATUSES } from "@/lib/consignments/state-machine";

/** Files allowed to contain raw colour literals. */
const COLOR_ALLOWLIST = [
  join("lib", "design", "tokens.ts"),
  join("app", "globals.css"),
  join("lib", "pdf"),          // @react-pdf has no CSS variables
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "test-results", "playwright-report"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

describe("status tokens", () => {
  it.each(STATUSES)("%s has a human label", (status) => {
    const token = STATUS_TOKENS[status];
    expect(token).toBeDefined();
    expect(token.label.trim().length).toBeGreaterThan(0);
    // The label must be words, not a raw enum value leaking into the UI.
    expect(token.label).not.toMatch(/_/);
  });

  it.each(STATUSES)("%s has an explanatory hint", (status) => {
    expect(STATUS_TOKENS[status].hint.length).toBeGreaterThan(10);
  });

  it("every status has distinct styling", () => {
    const classes = STATUSES.map((s) => STATUS_TOKENS[s].className);
    // draft and settled deliberately share neutral styling; the labels differ.
    expect(new Set(classes).size).toBeGreaterThanOrEqual(STATUSES.length - 1);
  });

  it("covers exactly the statuses the state machine defines", () => {
    expect(Object.keys(STATUS_TOKENS).sort()).toEqual([...STATUSES].sort());
  });
});

describe("StatusPill always renders a label", () => {
  it("prints the token label as text, not just a colour", () => {
    const src = readFileSync(
      join(process.cwd(), "features", "consignments", "components", "StatusPill.tsx"),
      "utf8",
    );
    expect(src).toContain("{token.label}");
  });
});

describe("expiry tones", () => {
  it.each([
    [-1, "expired"],
    [0, "urgent"],
    [15, "urgent"],
    [16, "soon"],
    [30, "soon"],
    [31, "ok"],
  ])("%i days left → %s", (days, tone) => {
    expect(expiryTone(days).tone).toBe(tone);
  });

  it("treats a missing date as neutral rather than urgent", () => {
    expect(expiryTone(null).tone).toBe("ok");
  });
});

describe("no stray colour literals", () => {
  it("keeps hex colours out of components", () => {
    const offenders: string[] = [];
    for (const file of walk(process.cwd())) {
      const rel = file.replace(`${process.cwd()}/`, "");
      if (COLOR_ALLOWLIST.some((a) => rel.startsWith(a))) continue;
      const src = readFileSync(file, "utf8");
      // #RGB / #RRGGBB in a style position.
      const hits = src.match(/#[0-9a-fA-F]{3,8}\b/g);
      if (hits) offenders.push(`${rel}: ${hits.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});
