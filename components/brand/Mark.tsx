/**
 * The LogiFlow mark.
 *
 * Three candidates while one is chosen. All share the same constraints:
 *   · a 24px grid, single stroke weight, so they sit beside lucide icons
 *   · currentColor only — the mark is never two-tone
 *   · legible at 16px in a collapsed sidebar rail and at 96px on a PDF header
 *   · NOT a truck. The truck is the Fleet nav icon; a logo that is also a menu
 *     item is why the current one reads as a placeholder.
 *
 * Each says "lorry receipt" rather than "logistics": the document is the thing
 * the business runs on, and the thing this product replaces.
 */
export type MarkVariant = "stamp" | "fold" | "road";

export interface MarkProps extends React.SVGProps<SVGSVGElement> {
  variant?: MarkVariant;
  /** Stroke weight; 1.75 reads better than lucide's 1.5 at small sizes here. */
  weight?: number;
}

export function Mark({ variant = "stamp", weight = 1.75, ...props }: MarkProps) {
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
      {variant === "stamp" && <StampMark />}
      {variant === "fold" && <FoldMark />}
      {variant === "road" && <RoadMark />}
    </svg>
  );
}

/**
 * Stamped receipt — a document whose lower third is struck solid, the way a
 * received stamp lands on a delivered LR. At 16px the solid band survives when
 * fine detail would not.
 */
function StampMark() {
  return (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7.5h8" />
      <path d="M8 11h5" />
      <path d="M4 15h16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" fill="currentColor" stroke="none" />
    </>
  );
}

/**
 * Folded waybill — the turned corner of a carbon copy. The fold is the
 * recognisable part and holds its shape when the rules inside drop out.
 */
function FoldMark() {
  return (
    <>
      <path d="M5 3.5h9l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20z" />
      <path d="M14 3.5V8.5h5" />
      <path d="M8.5 13h7" />
      <path d="M8.5 16.5h4.5" />
    </>
  );
}

/**
 * Road through document — the consignment moving. The diagonal is the only
 * thing that has to read at 16px, and it does.
 */
function RoadMark() {
  return (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
      <path d="M3.5 15.5 20.5 8" strokeWidth="2.25" />
      <path d="M7.5 8h6" />
      <path d="M13 18.5h4" />
    </>
  );
}
