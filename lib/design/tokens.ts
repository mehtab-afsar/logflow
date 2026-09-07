import type { Status } from "@/lib/consignments/state-machine";

/**
 * The one accent colour, as a literal.
 *
 * Needed anywhere CSS variables cannot reach: the PWA manifest, the browser
 * theme colour, and PDF rendering. Defined here so those places cannot drift
 * from the palette in globals.css.
 */
export const BRAND_INDIGO = "#1E1B4B";
export const BRAND_CANVAS = "#FFFFFF";

/**
 * Single source of truth for status presentation.
 *
 * PRD §8.2: status is colour, and colour is only status. Every consumer must
 * render the label too — colour alone fails both accessibility and a
 * photocopied LR. __tests__/design-tokens.test.ts enforces that pairing.
 */
export interface StatusToken {
  label: string;
  /** Tailwind classes for the pill. */
  className: string;
  /** Short description for tooltips and empty states. */
  hint: string;
}

export const STATUS_TOKENS: Readonly<Record<Status, StatusToken>> = {
  draft: {
    label: "Draft",
    className: "bg-neutral-100 text-neutral-700 border-neutral-200",
    hint: "Not yet dispatched. No driver link exists.",
  },
  dispatched: {
    label: "Dispatched",
    className: "bg-blue-50 text-blue-700 border-blue-200",
    hint: "Vehicle and driver assigned; the driver link is live.",
  },
  in_transit: {
    label: "In transit",
    className: "bg-amber-50 text-amber-800 border-amber-200",
    hint: "The driver has departed.",
  },
  delivered: {
    label: "Delivered",
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    hint: "Unloaded. Proof of delivery may still need checking.",
  },
  pod_verified: {
    label: "POD verified",
    className: "bg-emerald-100 text-emerald-900 border-emerald-300",
    hint: "Clean proof of delivery in hand. Ready to bill.",
  },
  invoiced: {
    label: "Invoiced",
    className: "bg-violet-50 text-violet-700 border-violet-200",
    hint: "On a freight bill.",
  },
  settled: {
    label: "Settled",
    className: "bg-neutral-100 text-neutral-600 border-neutral-200",
    hint: "Driver account closed.",
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-red-50 text-red-700 border-red-200",
    hint: "Voided. The LR number is retained and never reused.",
  },
};

/** Document-expiry urgency, used by fleet badges and the dashboard KPI. */
export function expiryTone(daysLeft: number | null): {
  tone: "expired" | "urgent" | "soon" | "ok";
  className: string;
} {
  if (daysLeft === null) return { tone: "ok", className: "text-neutral-400" };
  if (daysLeft < 0) return { tone: "expired", className: "bg-red-50 text-red-700 border-red-200" };
  if (daysLeft <= 15) return { tone: "urgent", className: "bg-red-50 text-red-700 border-red-200" };
  if (daysLeft <= 30) return { tone: "soon", className: "bg-amber-50 text-amber-800 border-amber-200" };
  return { tone: "ok", className: "text-neutral-500" };
}
