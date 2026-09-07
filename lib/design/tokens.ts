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
export const BRAND_PAPER = "#F7F7F4";
export const BRAND_INK = "#15171C";
export const BRAND_INK_2 = "#4E525B";
export const BRAND_INK_3 = "#8A8E97";
export const BRAND_LINE = "#DEDFDA";
export const BRAND_LINE_SOFT = "#ECEDE8";
export const BRAND_FOREST = "#1F7A4D";
export const BRAND_MARIGOLD = "#E5A500";
export const BRAND_ALERT = "#B42318";

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
    className: "border-line bg-line-soft text-ink-2",
    hint: "Not yet dispatched. No driver link exists.",
  },
  dispatched: {
    label: "Dispatched",
    className: "border-indigo-ink/20 bg-indigo-tint text-indigo-ink",
    hint: "Vehicle and driver assigned; the driver link is live.",
  },
  in_transit: {
    // Truck-paint yellow, and nothing else in the product uses it.
    label: "In transit",
    className: "border-marigold/35 bg-marigold-tint text-marigold-ink",
    hint: "The driver has departed.",
  },
  delivered: {
    label: "Delivered",
    className: "border-forest/25 bg-forest-tint text-forest-ink",
    hint: "Unloaded. Proof of delivery may still need checking.",
  },
  pod_verified: {
    // Same green, held harder: this is the state that unlocks billing, and it
    // must be distinguishable from "delivered" at a glance across the board.
    label: "POD verified",
    className: "border-forest/60 bg-forest-tint text-forest-ink font-semibold",
    hint: "Clean proof of delivery in hand. Ready to bill.",
  },
  invoiced: {
    label: "Invoiced",
    className: "border-violet/25 bg-violet-tint text-violet-ink",
    hint: "On a freight bill.",
  },
  settled: {
    label: "Settled",
    className: "border-line bg-line-soft text-ink-3",
    hint: "Driver account closed.",
  },
  cancelled: {
    label: "Cancelled",
    className: "border-alert/25 bg-alert-tint text-alert",
    hint: "Voided. The LR number is retained and never reused.",
  },
};

/** Document-expiry urgency, used by fleet badges and the dashboard KPI. */
export function expiryTone(daysLeft: number | null): {
  tone: "expired" | "urgent" | "soon" | "ok";
  className: string;
} {
  if (daysLeft === null) return { tone: "ok", className: "text-ink-3" };
  if (daysLeft < 0) return { tone: "expired", className: "border-alert/25 bg-alert-tint text-alert" };
  if (daysLeft <= 15) return { tone: "urgent", className: "border-alert/25 bg-alert-tint text-alert" };
  if (daysLeft <= 30) return { tone: "soon", className: "border-marigold/35 bg-marigold-tint text-marigold-ink" };
  return { tone: "ok", className: "text-ink-2" };
}
