/**
 * Consignment lifecycle, mirrored from SQL.
 *
 * public.consignment_transitions (migration 06) is AUTHORITATIVE — the server
 * re-reads it on every transition and never trusts a client. This module
 * exists so the UI can grey out impossible actions and show the right next
 * button without a round trip.
 *
 * __tests__/state-machine-parity.test.ts parses the migration and asserts the
 * two edge sets are identical, so this cannot silently drift.
 */

export const STATUSES = [
  "draft", "dispatched", "in_transit", "delivered",
  "pod_verified", "invoiced", "settled", "cancelled",
] as const;

export type Status = (typeof STATUSES)[number];

export const TRANSITIONS: Readonly<Record<Status, readonly Status[]>> = {
  draft:        ["dispatched", "cancelled"],
  dispatched:   ["in_transit", "cancelled"],
  in_transit:   ["delivered", "cancelled"],
  delivered:    ["pod_verified", "cancelled"],
  pod_verified: ["invoiced", "cancelled"],
  // Once money has moved you reverse it with a credit note, not a cancellation.
  invoiced:     ["settled", "cancelled"],
  settled:      [],
  cancelled:    [],
};

/** The happy-path successor, ignoring cancellation. Drives the primary button. */
const FORWARD: Readonly<Record<Status, Status | null>> = {
  draft: "dispatched",
  dispatched: "in_transit",
  in_transit: "delivered",
  delivered: "pod_verified",
  pod_verified: "invoiced",
  invoiced: "settled",
  settled: null,
  cancelled: null,
};

export function canTransition(from: Status, to: Status): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function nextForwardStatus(from: Status): Status | null {
  return FORWARD[from] ?? null;
}

export function isTerminal(status: Status): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Fields the UI must collect before attempting a transition. */
export function requiredFields(to: Status): readonly string[] {
  switch (to) {
    case "dispatched":   return ["vehicle_id", "driver_id"];
    case "pod_verified": return ["pod"];
    case "cancelled":    return ["reason"];
    default:             return [];
  }
}

export const STATUS_LABEL: Readonly<Record<Status, string>> = {
  draft: "Draft",
  dispatched: "Dispatched",
  in_transit: "In transit",
  delivered: "Delivered",
  pod_verified: "POD verified",
  invoiced: "Invoiced",
  settled: "Settled",
  cancelled: "Cancelled",
};

/** Label for the button that performs the transition. */
export const TRANSITION_LABEL: Readonly<Record<Status, string>> = {
  draft: "Move to draft",
  dispatched: "Dispatch",
  in_transit: "Mark in transit",
  delivered: "Mark delivered",
  pod_verified: "Verify POD",
  invoiced: "Generate bill",
  settled: "Mark settled",
  cancelled: "Cancel",
};

export const MILESTONES = ["loaded", "departed", "reached", "unloaded"] as const;
export type Milestone = (typeof MILESTONES)[number];

export const MILESTONE_LABEL: Readonly<Record<Milestone, string>> = {
  loaded: "Loaded",
  departed: "Departed",
  reached: "Reached destination",
  unloaded: "Unloaded",
};

/** The driver sees exactly one button: the next milestone not yet recorded. */
export function nextMilestone(done: readonly string[]): Milestone | null {
  return MILESTONES.find((m) => !done.includes(m)) ?? null;
}
