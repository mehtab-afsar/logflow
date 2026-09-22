/**
 * REPO GUARD — the mark is drawn three times, and all three must agree.
 *
 * WHY: @react-pdf renders to a PDF canvas rather than to HTML, so the printed
 * mark cannot reuse the DOM component; and the app icons are rasterised by a
 * script that samples the geometry itself. Three copies of one drawing is a
 * standing invitation to drift — which is exactly what happened before, when
 * app/icon.png was a filled truck and the in-app mark was a stroked one.
 *
 * Rather than compare pixels, this pins the geometry: the same two wave
 * curves, on the same 24-unit grid, in all three files. The rasteriser can't
 * reuse the SVG path string (it rebuilds the shapes numerically), so it is
 * pinned on the same control points and baselines instead.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dom = readFileSync(join(process.cwd(), "components/brand/Mark.tsx"), "utf8");
const pdf = readFileSync(join(process.cwd(), "lib/pdf/PdfMark.tsx"), "utf8");
const icons = readFileSync(join(process.cwd(), "scripts/generate-icons.ts"), "utf8");

/** The two wave curves. Nothing else. */
const SHAPES = {
  waveUpper: "M3 9C6 5 9 5 12 9C15 13 18 13 21 9",
  waveLower: "M3 15C6 11 9 11 12 15C15 19 18 19 21 15",
};

describe("brand mark", () => {
  it("the DOM mark carries both waves", () => {
    for (const d of Object.values(SHAPES)) expect(dom).toContain(d);
  });

  it("the print mark is the same drawing, not an approximation", () => {
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
    // control points and baselines rather than the path strings.
    expect(icons).toContain("sampleWave(9)");
    expect(icons).toContain("sampleWave(15)");
    expect(icons).toContain("baseline - 4");
    expect(icons).toContain("baseline + 4");
    expect(icons).toContain("1.75");
  });

  it("the second wave is reduced opacity, not a second colour", () => {
    expect(dom).toContain("opacity={0.45}");
    expect(pdf).toContain("opacity={0.45}");
    expect(icons).toContain("0.45");
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
