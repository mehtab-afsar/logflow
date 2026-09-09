/**
 * The LogiFlow mark — a stamped receipt.
 *
 * A document struck solid across its lower third, the way a received stamp
 * lands on a delivered lorry receipt. Chosen over a folded-corner document
 * (which is the generic file glyph every app uses) and a road-through-document
 * (whose diagonal collapses into an ambiguous slash at 16px).
 *
 * Two shapes only — the outline and the stamp. An earlier version also drew
 * two thin rule lines for the document's "text"; at 16–24px, where this mark
 * actually lives (the nav bar, a collapsed sidebar rail), those lines had no
 * room to be lines — they just blurred into noise inside the tile. Cut them
 * and the same drawing reads clean at 16px and still holds up at 96px on a
 * PDF header, instead of being tuned for one size at the other's expense.
 *
 * Constraints it is drawn to:
 *   · a 24px grid, single stroke weight, so they sit beside lucide icons
 *   · currentColor only — the mark is never two-tone
 *   · legible at 16px in a collapsed sidebar rail and at 96px on a PDF header
 *   · NOT a truck. The truck is the Fleet nav icon; a logo that is also a menu
 *     item is why the previous one read as a placeholder.
 *
 * It says "lorry receipt" rather than "logistics": the document is the thing
 * the business runs on, and the thing this product replaces.
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
      <rect x="4" y="3" width="16" height="18" rx="2" />
      {/* The stamp. Solid, because at 16px this is the only part that survives. */}
      <path d="M4 15h16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="currentColor" stroke="none" />
    </svg>
  );
}
