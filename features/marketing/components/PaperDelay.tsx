/**
 * "Paper is the slowest part of your business."
 *
 * Three paired bars on one shared 0–90 day scale, so the reader compares
 * lengths rather than reading six numbers. Grey is today; indigo tint is
 * LogiFlow. Nothing here is a card — the rows are the structure.
 */
const SCALE_DAYS = 90;

const ROWS = [
  { stage: "POD reaches the office", paper: [7, 20], paperLabel: "7–20 days", ours: [0, 1], oursLabel: "Same day" },
  { stage: "Freight bill raised", paper: [10, 25], paperLabel: "10–25 days", ours: [0, 2], oursLabel: "Within 2 days" },
  { stage: "Money in the bank", paper: [60, 90], paperLabel: "60–90 days", ours: [30, 35], oursLabel: "30–35 days" },
] as const;

function width(days: number) {
  /* A same-day bar still needs to be visible, hence the floor. */
  return `${Math.max((days / SCALE_DAYS) * 100, 2.5)}%`;
}

export function PaperDelay() {
  return (
    <section id="why" className="border-t border-line">
      <div className="mx-auto max-w-[1120px] px-7 py-[72px]">
        <h2 className="max-w-[20ch] text-[28px] font-semibold tracking-[-0.01em] text-ink">
          Paper is the slowest part of your business.
        </h2>
        <p className="mt-3 max-w-[62ch] text-[15px] leading-[1.55] text-ink-2">
          Nothing about the truck changed. The delay is the document walking back to the office in
          a driver&apos;s bag.
        </p>

        <div className="mt-10 space-y-8">
          {ROWS.map((row) => (
            <div key={row.stage} className="border-t border-line-soft pt-5">
              <p className="text-[15px] font-medium text-ink">{row.stage}</p>

              <div className="mt-4 grid gap-3 sm:grid-cols-[140px_1fr] sm:items-center">
                <p className="text-[12.5px] text-ink-3">On paper</p>
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 rounded-[2px] bg-bar-paper"
                    style={{ width: width(row.paper[1]) }}
                    aria-hidden
                  />
                  <span className="font-mono text-[12.5px] whitespace-nowrap text-ink-2">
                    {row.paperLabel}
                  </span>
                </div>

                <p className="text-[12.5px] text-ink-3">With LogiFlow</p>
                <div className="flex items-center gap-3">
                  <span
                    className="h-3 rounded-[2px] bg-indigo-tint ring-1 ring-indigo-ink/25 ring-inset"
                    style={{ width: width(row.ours[1]) }}
                    aria-hidden
                  />
                  <span className="font-mono text-[12.5px] whitespace-nowrap text-indigo-ink">
                    {row.oursLabel}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-8 max-w-[70ch] text-[12.5px] leading-[1.5] text-ink-3">
          Ranges are industry estimates for small and mid-size FTL fleets, shown on a 0–90 day
          scale. In a pilot we replace them with your own numbers and review them with you at the
          end of the 30 days.
        </p>
      </div>
    </section>
  );
}
