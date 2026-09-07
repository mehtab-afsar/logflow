"use client";

import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { formatINR } from "@/lib/money";
import { formatWeight } from "@/lib/india/format";
import { cn } from "@/lib/utils";
import { LR_COPIES, SAMPLE_LR, type LrCopy } from "@/features/marketing/sample";

/**
 * The hero is the product's own artifact, not a picture of it.
 *
 * An owner recognises a lorry receipt in under a second; that recognition is
 * the whole pitch, so the document fills itself in on load the way a clerk
 * writes it, and printing stamps it the way a rubber stamp would. The fill is
 * pure CSS (see .lr-field in globals.css) so it survives with JS still loading
 * and disappears entirely under prefers-reduced-motion.
 */

/** 350ms before the first field, 130ms between each after it. */
function fill(index: number): React.CSSProperties {
  return { animationDelay: `${350 + index * 130}ms` };
}

export function HeroLr() {
  const [copy, setCopy] = useState<LrCopy>("Consignor");
  const [printedAt, setPrintedAt] = useState(0);

  useEffect(() => {
    if (printedAt === 0) return;
    const t = setTimeout(() => setPrintedAt(0), 2200);
    return () => clearTimeout(t);
  }, [printedAt]);

  return (
    <div className="w-full">
      <div className="relative">
        <article className="relative overflow-hidden rounded-[4px] border border-line bg-white shadow-[0_24px_48px_-32px_rgba(21,23,28,0.45)]">
          {/* Carrier header — the letterhead of the printed book */}
          <header className="lr-field flex items-start justify-between gap-4 border-b border-line px-5 py-4" style={fill(0)}>
            <div>
              <p className="text-[15px] font-semibold text-ink">{SAMPLE_LR.carrier.name}</p>
              <p className="mt-0.5 text-[12.5px] text-ink-3">{SAMPLE_LR.carrier.address}</p>
              <p className="mt-0.5 font-mono text-[12.5px] text-ink-3">
                GSTIN {SAMPLE_LR.carrier.gstin}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] font-medium tracking-[0.12em] text-ink-3">LORRY RECEIPT</p>
              <p className="mt-1 font-mono text-[15px] font-medium text-ink">{SAMPLE_LR.lrNo}</p>
              <p className="mt-0.5 font-mono text-[12.5px] text-ink-3">{SAMPLE_LR.date}</p>
            </div>
          </header>

          {/* Parties */}
          <div className="grid grid-cols-1 divide-y divide-line-soft sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <Party
              label="Consignor"
              party={SAMPLE_LR.consignor}
              style={fill(1)}
            />
            <Party
              label="Consignee"
              party={SAMPLE_LR.consignee}
              style={fill(2)}
            />
          </div>

          {/* Cargo */}
          <div className="lr-field grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line-soft px-5 py-4 sm:grid-cols-4" style={fill(3)}>
            <Field label="Goods" value={SAMPLE_LR.goods} className="col-span-2" />
            <Field label="Packages" value={SAMPLE_LR.packages} />
            <Field label="Weight" value={formatWeight(SAMPLE_LR.weightKg)} mono />
            <Field label="From" value={SAMPLE_LR.from} />
            <Field label="To" value={SAMPLE_LR.to} />
            <Field label="E-way bill" value={SAMPLE_LR.ewb} mono />
            <Field label="Vehicle" value={SAMPLE_LR.vehicleNo} mono />
          </div>

          {/* Money. RCM is the default for most small fleets, and when it applies
              the LR carries the statutory note instead of a GST line. */}
          <div className="lr-field border-t border-line-soft bg-paper/60 px-5 py-4" style={fill(4)}>
            <dl className="space-y-1.5 text-[13px]">
              <Amount label="Freight" paise={SAMPLE_LR.freightPaise} />
              <Amount label="Loading" paise={SAMPLE_LR.loadingPaise} />
              <Amount label="Halting" paise={SAMPLE_LR.haltingPaise} />
              <div className="flex items-baseline justify-between border-t border-line pt-2">
                <dt className="font-medium text-ink">Total</dt>
                <dd className="font-mono text-[15px] font-medium text-ink">
                  {formatINR(SAMPLE_LR.totalPaise)}
                </dd>
              </div>
            </dl>
            <p className="mt-2.5 text-[12.5px] text-ink-2">
              GST: <span className="font-medium">RCM — payable by recipient</span> under Notification
              13/2017 (Central Tax — Rate).
            </p>
          </div>

          {/* Terms + QR footer */}
          <footer className="lr-field flex items-end justify-between gap-4 border-t border-line px-5 py-4" style={fill(5)}>
            <div>
              <p className="max-w-[38ch] text-[12px] leading-[1.5] text-ink-3">
                Goods carried at owner&apos;s risk. Claims not entertained after 7 days of delivery.
                Subject to Bengaluru jurisdiction.
              </p>
              <p className="mt-2 text-[12px] font-medium text-ink-2">{copy} copy</p>
            </div>
            <div className="shrink-0 text-center">
              <span className="flex size-14 items-center justify-center rounded-[4px] border border-line bg-white">
                <QrCode className="size-9 text-ink" strokeWidth={1.25} aria-hidden />
              </span>
              <p className="mt-1 text-[11px] text-ink-3">Scan to track</p>
            </div>
          </footer>

          {printedAt > 0 && (
            <span
              className="stamp pointer-events-none absolute right-6 bottom-24 rounded-[4px] border-2 border-forest px-3 py-1.5 font-mono text-[13px] font-medium text-forest"
              style={{ backgroundColor: "color-mix(in srgb, var(--color-forest-tint) 85%, transparent)" }}
            >
              4 copies printed
            </span>
          )}
        </article>
      </div>

      {/* Which of the four copies is on screen, and the print action itself. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {LR_COPIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCopy(c)}
            aria-pressed={copy === c}
            className={cn(
              "rounded-full border px-3 py-1 text-[12.5px] transition-colors duration-150",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink",
              copy === c
                ? "border-indigo-ink bg-indigo-tint font-medium text-indigo-ink"
                : "border-line bg-white text-ink-2 hover:border-ink-3",
            )}
          >
            {c}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPrintedAt(Date.now())}
          className="ml-auto rounded-md px-2 py-1 text-[12.5px] font-medium text-indigo-ink underline underline-offset-4 hover:text-indigo-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink"
        >
          Print LR
        </button>
      </div>
      <p aria-live="polite" className="sr-only">
        {printedAt > 0 ? "4 copies printed" : ""}
      </p>
    </div>
  );
}

function Party({
  label,
  party,
  style,
}: {
  label: string;
  party: { name: string; address: string; gstin: string; state: string };
  style: React.CSSProperties;
}) {
  return (
    <div className="lr-field px-5 py-4" style={style}>
      <p className="text-[11px] font-medium tracking-[0.08em] text-ink-3">{label.toUpperCase()}</p>
      <p className="mt-1.5 text-[13.5px] font-medium text-ink">{party.name}</p>
      <p className="mt-0.5 text-[12.5px] leading-[1.5] text-ink-2">{party.address}</p>
      <p className="mt-1 font-mono text-[12px] text-ink-3">{party.gstin}</p>
      <p className="text-[12px] text-ink-3">{party.state}</p>
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
      <p className="text-[11px] font-medium tracking-[0.08em] text-ink-3">{label.toUpperCase()}</p>
      <p className={cn("mt-1 text-[13px] text-ink", mono && "font-mono text-[12.5px] font-medium whitespace-nowrap")}>
        {value}
      </p>
    </div>
  );
}

function Amount({ label, paise }: { label: string; paise: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ink-2">{label}</dt>
      <dd className="font-mono text-ink">{formatINR(paise)}</dd>
    </div>
  );
}
