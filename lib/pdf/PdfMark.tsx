import { Path, Rect, Svg } from "@react-pdf/renderer";

/**
 * The LogiFlow mark, redrawn with @react-pdf's own SVG primitives.
 *
 * The DOM component in components/brand/Mark.tsx cannot be used here —
 * @react-pdf renders to a PDF canvas, not to HTML — so the geometry is
 * duplicated deliberately. It is the same 24-unit grid and the same four
 * shapes, so the printed mark and the on-screen mark are one drawing.
 *
 * __tests__/brand-mark.test.ts asserts the two stay identical.
 */
export function PdfMark({ size = 14, color = "#15171C" }: { size?: number; color?: string }) {
  return (
    <Svg viewBox="0 0 24 24" style={{ width: size, height: size }}>
      <Rect
        x="4" y="3" width="16" height="18" rx="2"
        stroke={color} strokeWidth={1.75} fill="none"
      />
      <Path d="M8 7.5h8" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
      <Path d="M8 11h5" stroke={color} strokeWidth={1.75} strokeLinecap="round" />
      {/* The stamp. */}
      <Path d="M4 15h16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill={color} />
    </Svg>
  );
}
