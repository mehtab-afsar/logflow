"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Reveal } from "@/features/marketing/components/Reveal";

/**
 * "Paper is the slowest part of your business."
 *
 * Three paired bars on one shared 0–90 day scale, so the reader compares
 * lengths rather than reading six numbers. The paper bar is a hairline grey
 * and only the LogiFlow bar carries colour, because the shorter bar is the
 * whole point and it should be the thing the eye lands on. Nothing here is a
 * card — the rows are the structure.
 *
 * The bars do grow in once, the first time each row is scrolled into view —
 * a claim about delay demonstrated once, not looped or replayed on every
 * scroll past. See Bar() below.
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
      <div className="mx-auto max-w-[1120px] px-7 py-[104px]">
        <Reveal>
          <h2 className="max-w-[20ch] text-[clamp(30px,3.6vw,44px)] leading-[1.08] font-medium tracking-[-0.03em] text-ink">
            Paper is the slowest part of your business.
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <p className="mt-4 max-w-[52ch] text-[18px] leading-[1.5] text-ink-2">
            Nothing about the truck changed. The delay is the document walking back to the office
            in a driver&apos;s bag.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-9">
          {ROWS.map((row, i) => (
            <Reveal key={row.stage} delay={i * 80}>
              <h3 className="mb-3 text-[20px] font-medium tracking-[-0.015em] text-ink">
                {row.stage}
              </h3>
              <div className="grid gap-2">
                <Bar label="On paper" fill={width(row.paper[1])} value={row.paperLabel} />
                <Bar label="With LogiFlow" fill={width(row.ours[1])} value={row.oursLabel} ours />
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={200}>
          <p className="mt-7 max-w-[70ch] text-[14px] leading-[1.5] text-ink-3">
            Ranges are industry estimates for small and mid-size FTL fleets, shown on a 0–90 day
            scale. In a pilot we replace them with your own numbers and review them with you at
            the end of the 30 days.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function Bar({
  label,
  fill,
  value,
  ours,
}: {
  label: string;
  /** Percentage string from width(); named `fill` so it does not shadow it. */
  fill: string;
  value: string;
  ours?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setGrown(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="grid grid-cols-[80px_1fr_84px] items-center gap-3 text-[15px] min-[600px]:grid-cols-[110px_1fr_100px] min-[600px]:gap-4">
      <span className="text-ink-3">{label}</span>
      <span ref={ref} className="h-[10px] rounded-[2px] bg-paper" aria-hidden>
        <span
          className={cn("block h-full rounded-[2px] transition-[width] duration-700 ease-out", ours ? "bg-indigo-ink" : "bg-line")}
          style={{ width: grown ? fill : "0%" }}
        />
      </span>
      <span className="text-right font-medium text-ink">{value}</span>
    </div>
  );
}
