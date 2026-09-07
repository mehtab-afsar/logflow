"use client";

import { useState } from "react";
import { Check, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEMO_TRIPS, type DemoTrip } from "@/features/marketing/sample";

/**
 * What the customer sees instead of ringing the office.
 *
 * Drawn as a phone card because that is where it is actually opened — inside
 * WhatsApp, on the consignee's phone. The real page at /track/[token] is
 * server-rendered with no JavaScript; this is only its demo twin.
 */
export function TrackingDemo() {
  const [query, setQuery] = useState("LF-2627-000412");
  const [trip, setTrip] = useState<DemoTrip | null>(DEMO_TRIPS["LF-2627-000412"]);
  const [searched, setSearched] = useState(false);

  function track() {
    setTrip(DEMO_TRIPS[query.trim().toUpperCase()] ?? null);
    setSearched(true);
  }

  return (
    <section id="tracking" className="border-t border-line bg-white">
      <div className="mx-auto grid max-w-[1120px] gap-10 px-7 py-[72px] min-[820px]:grid-cols-[1fr_340px]">
        <div>
          <h2 className="max-w-[22ch] text-[28px] font-semibold tracking-[-0.01em] text-ink">
            What your customer sees instead of calling you.
          </h2>
          <p className="mt-3 max-w-[58ch] text-[15px] leading-[1.55] text-ink-2">
            Every LR carries a tracking link and a QR code. The consignee opens it in WhatsApp, sees
            where the truck is, and downloads the signed POD himself once it is delivered. Try it
            with the sample trips.
          </p>

          <div className="mt-7 flex max-w-[420px] flex-wrap gap-2">
            <label className="sr-only" htmlFor="lr-lookup">
              LR number
            </label>
            <input
              id="lr-lookup"
              value={query}
              onChange={(e) => setQuery(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && track()}
              spellCheck={false}
              className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2.5 font-mono text-[14px] text-ink focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-indigo-ink"
            />
            <button
              type="button"
              onClick={track}
              className="rounded-md bg-indigo-ink px-4 py-2.5 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-indigo-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink"
            >
              Track
            </button>
          </div>
          <p className="mt-2.5 text-[12.5px] text-ink-3">
            Sample numbers: <span className="font-mono">LF-2627-000412</span> (delivered) and{" "}
            <span className="font-mono">LF-2627-000418</span> (in transit).
          </p>
        </div>

        <div className="mx-auto w-full max-w-[340px]">
          <div className="rounded-[14px] border border-line bg-paper p-3 shadow-[0_1px_2px_rgba(21,23,28,0.06)]">
            <div className="rounded-[10px] bg-white p-4">
              {trip ? <TripCard trip={trip} /> : <NotFound query={query} searched={searched} />}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TripCard({ trip }: { trip: DemoTrip }) {
  const delivered = trip.status === "delivered";

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[13px] text-ink-3">{trip.lrNo}</p>
          <p className="mt-1 text-[19px] leading-tight font-medium text-ink">
            {trip.from} → {trip.to}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap",
            delivered
              ? "border-forest/30 bg-forest-tint text-forest-ink"
              : "border-marigold/40 bg-marigold-tint text-marigold-ink",
          )}
        >
          {delivered ? "Delivered" : "In transit"}
        </span>
      </div>

      <p className="mt-1 font-mono text-[12.5px] text-ink-3">{trip.vehicleNo}</p>

      <ol className="mt-5">
        {trip.events.map((e, i) => {
          const now = i === trip.events.length - 1;
          return (
            <li key={e.at} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    now ? "border-indigo-ink bg-indigo-ink text-white" : "border-line bg-white text-ink-3",
                  )}
                >
                  <Check className="size-3" strokeWidth={2.5} aria-hidden />
                </span>
                {i < trip.events.length - 1 && <span className="w-px flex-1 bg-line" />}
              </div>
              <div className="pb-4">
                <p className={cn("text-[13.5px]", now ? "font-medium text-ink" : "text-ink-2")}>
                  {e.label}
                </p>
                <p className="mt-0.5 font-mono text-[11.5px] text-ink-3">
                  {e.at} · {e.place}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {trip.pod ? (
        <div className="flex items-center gap-3 rounded-md border border-line bg-paper px-3 py-2.5">
          <Download className="size-4 shrink-0 text-ink-2" strokeWidth={1.5} aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink">Proof of delivery</p>
            <p className="font-mono text-[11.5px] text-ink-3">Signed {trip.pod.at}</p>
          </div>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-line px-3 py-2.5 text-[12.5px] text-ink-3">
          Proof of delivery appears here once the truck is unloaded.
        </p>
      )}
    </>
  );
}

function NotFound({ query, searched }: { query: string; searched: boolean }) {
  return (
    <div className="py-10 text-center">
      <p className="text-[14px] font-medium text-ink">No trip with that number.</p>
      <p className="mt-1.5 text-[12.5px] leading-[1.5] text-ink-3">
        {searched && query ? (
          <>
            <span className="font-mono">{query}</span> is not one of the sample trips. Try{" "}
            <span className="font-mono">LF-2627-000412</span>.
          </>
        ) : (
          <>Enter an LR number to see the customer&apos;s view.</>
        )}
      </p>
    </div>
  );
}
