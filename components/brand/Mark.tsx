/**
 * The LogiFlow mark — two wave lines, drawn for the word the product is named
 * after: flow. The upper line is what's moving now; the fainter line behind
 * it is the rest of the fleet in motion, not a decoration.
 *
 * Two shapes only — one wave at full weight, one wave at reduced opacity.
 * Same stroke, same curve, offset — so the drawing survives 16px without
 * turning into two shapes competing for the same handful of pixels.
 *
 * Constraints it is drawn to:
 *   · a 24px grid, single stroke weight, so they sit beside lucide icons
 *   · currentColor only — the mark is never two-tone (the second wave is the
 *     same colour at reduced opacity, not a second hue)
 *   · legible at 16px in a collapsed sidebar rail and at 96px on a PDF header
 */
export interface MarkProps extends React.SVGProps<SVGSVGElement> {
  /** Stroke weight; 1.75 reads better than lucide's 1.5 at small sizes here. */
  weight?: number;
}

export function Mark({ weight = 1.75, ...props }: MarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="LogiFlow"
      {...props}
    >
      <path d="M3 9C6 5 9 5 12 9C15 13 18 13 21 9" />
      {/* The second wave. Reduced opacity, not a second colour — the mark stays single-colour. */}
      <path d="M3 15C6 11 9 11 12 15C15 19 18 19 21 15" opacity={0.45} />
    </svg>
  );
}
