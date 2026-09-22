/**
 * The hero's only decoration: five hairline waves, spanning the full width
 * behind the (centered) copy. Same drawing language as the brand mark
 * (components/brand/Mark.tsx) at a much larger scale — this is the wave motif
 * read as a watermark, not a screenshot or a stock gradient blob. The mask
 * fades the centre out and keeps the edges, so the lines frame the text
 * instead of sitting behind it. Static on purpose: the page's own motion rule
 * (see globals.css) is "movement should only ever mean something", and a
 * looping background animation means nothing.
 */
const LINES = [
  { y: 70, amp: 30, opacity: 0.14, width: 1.2 },
  { y: 150, amp: 44, opacity: 0.11, width: 1.1 },
  { y: 240, amp: 38, opacity: 0.2, width: 1.5 },
  { y: 330, amp: 48, opacity: 0.1, width: 1.1 },
  { y: 410, amp: 28, opacity: 0.13, width: 1.2 },
] as const;

function wavePath(y: number, amp: number) {
  return `M-50 ${y} C90 ${y - amp} 170 ${y - amp} 310 ${y} S550 ${y + amp} 690 ${y} S930 ${y - amp} 1070 ${y} S1310 ${y + amp} 1450 ${y}`;
}

export function HeroWaves() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_right,black,transparent_28%,transparent_72%,black)]"
    >
      <svg
        viewBox="0 0 1400 480"
        className="h-full w-full stroke-indigo-ink"
        preserveAspectRatio="xMidYMid slice"
      >
        {LINES.map((l, i) => (
          <path
            key={i}
            d={wavePath(l.y, l.amp)}
            fill="none"
            strokeWidth={l.width}
            strokeLinecap="round"
            opacity={l.opacity}
          />
        ))}
      </svg>
    </div>
  );
}
