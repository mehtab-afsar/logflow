"use client";

import { useRef, useState } from "react";
import { formatINR } from "@/lib/money";
import { formatRoute, formatWeight } from "@/lib/india/format";
import { cn } from "@/lib/utils";
import { LR_COPIES, SAMPLE_LR, type LrCopy } from "@/features/marketing/sample";

/**
 * The hero is the product's own artifact, not a picture of it.
 *
 * An owner recognises a lorry receipt in under a second, and that recognition
 * is the whole pitch — so this is laid out as the printed document, full width,
 * square-cornered, with the field labels in the small spaced caps a real LR
 * book uses. It is the only memorable element on the page; everything below is
 * hairlines and whitespace.
 *
 * The four tabs are the four carbon copies. Switching them tints the document
 * the way the book is actually dyed, which is the fastest way to explain "four
 * copies from one print" without a sentence of copy. That tint change is the
 * only motion here: the document does not animate itself in on load, because a
 * reader who has scrolled back up should find the same still sheet they left.
 */

/**
 * Full literal class strings, not `bg-copy-${slug}` — Tailwind scans source
 * text, so an interpolated class name compiles to nothing and the document
 * silently loses its tint.
 */
const COPY_TINT: Record<LrCopy, string> = {
  Consignor: "bg-copy-consignor",
  Consignee: "bg-copy-consignee",
  Driver: "bg-copy-driver",
  Office: "bg-copy-office",
};

export function HeroLr() {
  const [copy, setCopy] = useState<LrCopy>("Consignor");
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = LR_COPIES.indexOf(copy);

  /**
   * Arrow keys move between tabs and select as they go. Without this a
   * `role="tablist"` is a promise to a screen reader that the keyboard does
   * not keep, which is worse than plain buttons would have been.
   */
  function onKeyDown(e: React.KeyboardEvent) {
    const last = LR_COPIES.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight") next = index === last ? 0 : index + 1;
    if (e.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    setCopy(LR_COPIES[next]);
    tabs.current[next]?.focus();
  }

  return (
    <div className="w-full">
      <div role="tablist" aria-label="Lorry receipt copies" className="flex flex-wrap gap-1.5">
        {LR_COPIES.map((c, i) => (
          <button
            key={c}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`lr-tab-${c.toLowerCase()}`}
            aria-selected={copy === c}
            aria-controls="lr-doc"
            tabIndex={copy === c ? 0 : -1}
            onClick={() => setCopy(c)}
            onKeyDown={onKeyDown}
            className={cn(
              "-mb-px rounded-t-[8px] border border-b-0 border-line px-4 py-2 text-[14px]",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-indigo-ink",
              copy === c
                ? cn("relative z-10 font-medium text-ink", COPY_TINT[c])
                : "bg-paper text-ink-2 hover:text-ink",
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <article
        id="lr-doc"
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`lr-tab-${copy.toLowerCase()}`}
        className={cn(
          "border border-line px-[18px] py-[22px] text-[14px] transition-colors duration-200",
          "shadow-[0_40px_80px_-60px_rgba(23,32,42,0.4)] min-[760px]:px-9 min-[760px]:py-8",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-indigo-ink",
          COPY_TINT[copy],
        )}
      >
        {/* The letterhead of the printed book. */}
        <header className="grid gap-4 border-b border-ink pb-5 min-[760px]:grid-cols-[1fr_auto]">
          <div>
            <p className="text-[18px] font-semibold text-ink">{SAMPLE_LR.carrier.name}</p>
            <p className="mt-0.5 text-[13px] text-ink-2">{SAMPLE_LR.carrier.address}</p>
            <p className="font-mono text-[13px] text-ink-2">GSTIN {SAMPLE_LR.carrier.gstin}</p>
          </div>
          <div className="min-[760px]:text-right">
            <p className="text-[13px] font-semibold tracking-[0.08em] text-ink">LORRY RECEIPT</p>
            <p className="mt-1 font-mono text-[22px] text-ink">{SAMPLE_LR.lrNo}</p>
            <p className="font-mono text-[13px] text-ink-2">{SAMPLE_LR.date}</p>
          </div>
        </header>

        <div className="grid divide-y divide-line border-b border-line min-[760px]:grid-cols-2 min-[760px]:divide-x min-[760px]:divide-y-0">
          <Party label="Consignor" party={SAMPLE_LR.consignor} />
          <Party label="Consignee" party={SAMPLE_LR.consignee} className="min-[760px]:pl-10" />
        </div>

        <div className="grid grid-cols-2 gap-5 border-b border-line py-[18px] min-[760px]:grid-cols-6">
          <Field label="Goods" value={SAMPLE_LR.goods} className="col-span-2" />
          <Field label="Packages" value={SAMPLE_LR.packages} />
          <Field label="Weight" value={formatWeight(SAMPLE_LR.weightKg)} mono />
          <Field label="From / to" value={formatRoute(SAMPLE_LR.from, SAMPLE_LR.to)} />
          <Field label="Vehicle" value={SAMPLE_LR.vehicleNo} mono />
          <Field label="E-way bill" value={SAMPLE_LR.ewb} mono />
        </div>

        <div className="grid gap-8 pt-5 min-[760px]:grid-cols-[1.4fr_1fr]">
          <div className="text-[12px] leading-[1.5] text-ink-2">
            {/* RCM is the default for most small fleets, and when it applies the
                LR carries the statutory note instead of a GST line. */}
            <p>
              GST: RCM — payable by recipient under Notification 13/2017 (Central Tax — Rate).
            </p>
            <p className="mt-2">
              Goods carried at owner&apos;s risk. Claims not entertained after 7 days of delivery.
              Subject to Bengaluru jurisdiction.
            </p>
            <p className="mt-3.5 flex items-center gap-3 text-ink-3">
              <span
                aria-hidden
                className="size-11 shrink-0 border border-ink opacity-75"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, var(--color-ink) 0 3px, transparent 3px 6px), repeating-linear-gradient(0deg, var(--color-ink) 0 3px, transparent 3px 6px)",
                  backgroundBlendMode: "multiply",
                }}
              />
              Scan to track
            </p>
          </div>

          <dl className="grid grid-cols-[1fr_auto] content-start gap-x-6 gap-y-1.5 font-mono text-[15px]">
            <Amount label="Freight" paise={SAMPLE_LR.freightPaise} />
            <Amount label="Loading" paise={SAMPLE_LR.loadingPaise} />
            <Amount label="Halting" paise={SAMPLE_LR.haltingPaise} />
            <dt className="mt-1 border-t border-ink pt-2 font-semibold text-ink">Total</dt>
            <dd className="mt-1 border-t border-ink pt-2 text-right font-semibold text-ink">
              {formatINR(SAMPLE_LR.totalPaise)}
            </dd>
          </dl>
        </div>

        <p className="mt-5 text-right text-[12px] text-ink-3">
          {copy} copy · {index + 1} of {LR_COPIES.length}
        </p>
      </article>
    </div>
  );
}

function Party({
  label,
  party,
  className,
}: {
  label: string;
  party: { name: string; address: string; gstin: string; state: string };
  className?: string;
}) {
  return (
    <div className={cn("py-[18px]", className)}>
      <p className="text-[11px] tracking-[0.06em] text-ink-3">{label.toUpperCase()}</p>
      <p className="mt-1.5 text-[15px] font-semibold text-ink">{party.name}</p>
      <p className="text-[14px] leading-[1.45] text-ink-2">{party.address}</p>
      <p className="font-mono text-[13px] text-ink-2">
        {party.gstin} · {party.state}
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  className,
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[11px] tracking-[0.06em] text-ink-3">{label.toUpperCase()}</p>
      <p className={cn("mt-1 text-[15px] text-ink", mono && "font-mono whitespace-nowrap")}>
        {value}
      </p>
    </div>
  );
}

function Amount({ label, paise }: { label: string; paise: number }) {
  return (
    <>
      <dt className="text-ink-2">{label}</dt>
      <dd className="text-right text-ink">{formatINR(paise)}</dd>
    </>
  );
}
