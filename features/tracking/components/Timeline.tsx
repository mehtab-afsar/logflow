import { Check } from "lucide-react";
import { formatDateTime } from "@/lib/india/format";
import { STATUS_TOKENS } from "@/lib/design/tokens";
import { MILESTONE_LABEL, type Milestone, type Status } from "@/lib/consignments/state-machine";

export interface TrackEvent {
  at: string;
  status: string | null;
  milestone: string | null;
  kind: string;
  place: string | null;
}

/**
 * Server-rendered only. No 'use client' anywhere in this tree: the customer
 * opens this inside WhatsApp's in-app browser, sometimes with JavaScript
 * disabled, always on a slow connection.
 */
export function Timeline({ events }: { events: TrackEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-ink-3">No updates yet.</p>;
  }

  return (
    <ol className="space-y-0">
      {events.map((e, i) => {
        const isLast = i === events.length - 1;
        const label = e.milestone
          ? MILESTONE_LABEL[e.milestone as Milestone] ?? e.milestone
          : e.status
            ? (STATUS_TOKENS[e.status as Status]?.label ?? e.status)
            : e.kind;

        return (
          <li key={`${e.at}-${i}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border ${
                  isLast ? "border-primary bg-primary text-primary-foreground" : "border-line bg-white text-ink-3"
                }`}
              >
                <Check className="size-3" strokeWidth={2.5} />
              </span>
              {!isLast && <span className="w-px flex-1 bg-line" />}
            </div>

            <div className="pb-5">
              <p className={`text-sm ${isLast ? "font-medium" : "text-ink-2"}`}>{label}</p>
              <p className="text-xs text-ink-3">
                {formatDateTime(e.at)}
                {e.place ? ` · ${e.place}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
