/**
 * REPO GUARD — the mark is drawn three times, and all three must agree.
 *
 * WHY: @react-pdf renders to a PDF canvas rather than to HTML, so the printed
 * mark cannot reuse the DOM component; and the app icons are rasterised by a
 * script that samples the geometry itself. Three copies of one drawing is a
 * standing invitation to drift — which is exactly what happened before, when
 * app/icon.png was a filled truck and the in-app mark was a stroked one.
 *
 * Rather than compare pixels, this pins the geometry: the same two shapes,
 * on the same 24-unit grid, in all three files. It used to be four — two thin
 * rule lines were cut because they only ever read as noise at the 16–24px
 * this mark is actually shown at, never as the "text" they were meant to
 * suggest. Two bold shapes instead of four faint ones is the fix, and this
 * test was updated deliberately alongside it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dom = readFileSync(join(process.cwd(), "components/brand/Mark.tsx"), "utf8");
const pdf = readFileSync(join(process.cwd(), "lib/pdf/PdfMark.tsx"), "utf8");
const icons = readFileSync(join(process.cwd(), "scripts/generate-icons.ts"), "utf8");

/** The document outline and the stamp. Nothing else. */
const SHAPES = {
  stamp: "M4 15h16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z",
};

describe("brand mark", () => {
  it("the DOM mark carries both shapes", () => {
    expect(dom).toContain('x="4"');
    expect(dom).toContain('y="3"');
    expect(dom).toContain('width="16"');
    expect(dom).toContain('height="18"');
    for (const d of Object.values(SHAPES)) expect(dom).toContain(d);
  });

  it("the print mark is the same drawing, not an approximation", () => {
    expect(pdf).toContain('x="4"');
    expect(pdf).toContain('y="3"');
    expect(pdf).toContain('width="16"');
    expect(pdf).toContain('height="18"');
    for (const d of Object.values(SHAPES)) expect(pdf).toContain(d);
  });

  it("both use the same 24-unit grid and stroke weight", () => {
    expect(dom).toContain('viewBox="0 0 24 24"');
    expect(pdf).toContain('viewBox="0 0 24 24"');
    expect(dom).toContain("1.75");
    expect(pdf).toContain("1.75");
  });

  it("the icon generator samples the same geometry", () => {
    // The rasteriser rebuilds the shapes numerically, so it is pinned on the
    // numbers rather than the path strings.
    expect(icons).toContain("roundedRect(4, 3, 16, 18, 2)");
    expect(icons).toContain("v >= 15");
    expect(icons).toContain("1.75");
    // The two rule lines are gone from the drawing; make sure they don't
    // quietly come back via the rasteriser's own segment() helper.
    expect(icons).not.toMatch(/\bfunction segment\(/);
  });

  it("the mark is single-colour — it is never two-tone", () => {
    expect(dom).toContain("currentColor");
    // No hex literals in the DOM component; colour comes from the consumer.
    expect(dom).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("is not a truck — that glyph belongs to the Fleet nav item", () => {
    expect(dom).not.toMatch(/\bTruck\b/);
    expect(pdf).not.toMatch(/\bTruck\b/);
  });
});
