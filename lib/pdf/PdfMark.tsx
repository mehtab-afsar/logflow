import { Path, Svg } from "@react-pdf/renderer";

/**
 * The LogiFlow mark, redrawn with @react-pdf's own SVG primitives.
 *
 * The DOM component in components/brand/Mark.tsx cannot be used here —
 * @react-pdf renders to a PDF canvas, not to HTML — so the geometry is
 * duplicated deliberately. It is the same 24-unit grid and the same two
 * wave strokes, so the printed mark and the on-screen mark are one drawing.
 *
 * __tests__/brand-mark.test.ts asserts the two stay identical.
 */
export function PdfMark({ size = 14, color = "#17202A" }: { size?: number; color?: string }) {
  return (
    <Svg viewBox="0 0 24 24" style={{ width: size, height: size }}>
      <Path
        d="M3 9C6 5 9 5 12 9C15 13 18 13 21 9"
        stroke={color} strokeWidth={1.75} fill="none"
      />
      {/* The second wave. */}
      <Path
        d="M3 15C6 11 9 11 12 15C15 19 18 19 21 15"
        stroke={color} strokeWidth={1.75} fill="none" opacity={0.45}
      />
    </Svg>
  );
}
