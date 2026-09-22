"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { DEMO_TRIPS, type DemoTrip } from "@/features/marketing/sample";
import { Reveal } from "@/features/marketing/components/Reveal";

const SAMPLES = [
  { lrNo: "LF-2627-000412", note: "delivered" },
  { lrNo: "LF-2627-000418", note: "in transit" },
] as const;

/**
 * What the customer sees instead of ringing the office.
 *
 * Working, not a screenshot: an owner who types a number and gets a real answer
 * has already understood the feature, and the sample buttons exist so nobody
 * has to invent an LR number to try it. The real page at /track/[token] is
 * server-rendered with no JavaScript; this is only its demo twin.
 *
 * The card shows every milestone the trip will have, with the ones still ahead
 * greyed. A consignee wants to know what is left as much as what is done.
 */
export function TrackingDemo() {
  const [query, setQuery] = useState("LF-2627-000412");
  const [trip, setTrip] = useState<DemoTrip | null>(DEMO_TRIPS["LF-2627-000412"]);
  const [missing, setMissing] = useState(false);

  /**
   * Takes the value to look up rather than reading `query`, because the sample
   * buttons set the field and search in the same click — reading state there
   * would look up whatever was in the box before.
   */
  function track(value: string = query) {
    const found = DEMO_TRIPS[value.trim().toUpperCase()] ?? null;
    setTrip(found);
    setMissing(!found);
  }

  return (
    <section id="tracking" className="border-t border-line">
      <div className="mx-auto max-w-[1120px] px-7 py-[104px]">
        <Reveal>
          <h2 className="max-w-[22ch] text-[clamp(30px,3.6vw,44px)] leading-[1.08] font-medium tracking-[-0.03em] text-ink">
            What your customer sees instead of calling you.
          </h2>
        </Reveal>
        <Reveal delay={100}>
          <p className="mt-4 max-w-[58ch] text-[18px] leading-[1.5] text-ink-2">
            Every LR carries a tracking link and a QR code. The consignee opens it in WhatsApp,
            sees where the truck is, and downloads the signed POD themselves once it is delivered.
            Try it with the sample trips.
          </p>
        </Reveal>

        <Reveal delay={150} className="mt-12 grid gap-14 min-[860px]:grid-cols-[0.9fr_1.1fr]">
          <div>
            <div className="flex max-w-[420px] items-end gap-2.5">
              <div className="grid flex-1 gap-2">
                <label htmlFor="lr-lookup" className="text-[14px] text-ink-2">
                  LR number
                </label>
                <input
                  id="lr-lookup"
                  value={query}
                  onChange={(e) => setQuery(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === "Enter" && track()}
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full min-w-0 rounded-[8px] border border-line bg-white px-3.5 py-3 font-mono text-[16px] text-ink focus:border-indigo-ink focus:shadow-[0_0_0_3px_var(--color-indigo-tint)] focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => track()}
                className="rounded-[8px] bg-ink px-5 py-3 text-[15px] font-medium text-white transition-colors duration-150 hover:bg-ink-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-indigo-ink"
              >
                Track
              </button>
            </div>

            {missing && (
              <p className="mt-2.5 text-[14px] text-alert">
                No LR with that number. Try one of the samples below.
              </p>
            )}

            <p className="mt-3.5 text-[14px] text-ink-3">
              Samples:{" "}
              {SAMPLES.map((s, i) => (
                <span key={s.lrNo}>
                  {i > 0 && " · "}
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(s.lrNo);
                      track(s.lrNo);
                    }}
                    className="font-mono text-indigo-ink hover:text-indigo-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-indigo-ink"
                  >
                    {s.lrNo}
                  </button>{" "}
                  ({s.note})
                </span>
              ))}
            </p>
          </div>

          <div
            aria-live="polite"
            className="rounded-[12px] border border-line bg-white px-6 py-6"
          >
            {trip ? <TripCard trip={trip} /> : <NotFound query={query} />}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function TripCard({ trip }: { trip: DemoTrip }) {
  const delivered = trip.status === "delivered";

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-line pb-[18px]">
        <div>
          <p className="font-mono text-[17px] text-ink">{trip.lrNo}</p>
          <p className="text-[15px] text-ink-2">
            {trip.from} → {trip.to}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-[5px] text-[13px] whitespace-nowrap",
            delivered ? "bg-indigo-tint text-indigo-ink" : "bg-paper text-ink-2",
          )}
        >
          {delivered ? "Delivered" : "In transit"} ·{" "}
          <span className="font-mono">{trip.vehicleNo}</span>
        </span>
      </div>

      <ol className="mt-1.5">
        {trip.events.map((e, i) => (
          <li
            key={e.label}
            className={cn("relative grid grid-cols-[20px_1fr] gap-3.5 py-3", e.pending && "opacity-50")}
          >
            <span className="mt-[7px] flex justify-center">
              <span
                className={cn(
                  "size-[9px] shrink-0 rounded-full",
                  e.pending ? "border border-line bg-white" : "bg-indigo-ink",
                )}
                aria-hidden
              />
            </span>
            {i < trip.events.length - 1 && (
              <span
                className="absolute top-[28px] bottom-[-12px] left-[9px] w-px bg-line"
                aria-hidden
              />
            )}
            <div>
              <p className="text-[15px] font-medium text-ink">{e.label}</p>
              {e.at && (
                <p className="text-[13px] text-ink-3">
                  {e.at}
                  {e.place ? ` · ${e.place}` : ""}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {trip.pod && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-dashed border-line px-4 py-3.5 text-[14px]">
          <span className="text-ink-2">Proof of delivery · Signed {trip.pod.at}</span>
          <a
            href="#"
            className="font-medium text-indigo-ink hover:text-indigo-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-indigo-ink"
          >
            Download POD
          </a>
        </div>
      )}
    </>
  );
}

function NotFound({ query }: { query: string }) {
  return (
    <div className="py-12 text-center">
      <p className="text-[15px] font-medium text-ink">No LR with that number.</p>
      <p className="mt-1.5 text-[14px] leading-[1.5] text-ink-3">
        <span className="font-mono">{query}</span> is not one of the sample trips.
      </p>
    </div>
  );
}
