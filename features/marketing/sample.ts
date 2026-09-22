/**
 * The one sample consignment the landing page is built around.
 *
 * It is deliberately a real-looking Bengaluru → Chennai auto-components trip:
 * an owner should recognise every field from the book on his desk. Replace
 * these details with the client's own before a demo (see §8 of the design doc).
 *
 * The GSTINs are fictional but carry correct mod-36 check digits, so they pass
 * the same validator the LR form uses. A demo document that our own software
 * would reject is worse than no sample at all.
 */
export const SAMPLE_LR = {
  carrier: {
    name: "Apex Roadways",
    address: "No. 14, Hosur Road, Bengaluru 560068",
    gstin: "29AAACA1234F1Z6",
  },
  lrNo: "LF-2627-000412",
  date: "03-09-2026",
  consignor: {
    name: "Sundaram Auto Components Pvt Ltd",
    address: "Plot 27, Peenya Industrial Area, Bengaluru 560058",
    gstin: "29AABCS2345K1Z6",
    state: "Karnataka (29)",
  },
  consignee: {
    name: "Vikram Motors Distributors",
    address: "112, Ambattur Industrial Estate, Chennai 600058",
    gstin: "33AACCV6789L1ZN",
    state: "Tamil Nadu (33)",
  },
  from: "Bengaluru",
  to: "Chennai",
  goods: "Auto components — brake assemblies",
  packages: "42 bundles",
  weightKg: 8_400,
  ewb: "1812 3456 7890",
  vehicleNo: "KA 51 AB 4471",
  driver: "Ramesh Kumar",
  freightPaise: 4_100_000,
  loadingPaise: 150_000,
  haltingPaise: 100_000,
  totalPaise: 4_350_000,
} as const;

/** The four copies every LR book prints. Order matches the paper book. */
export const LR_COPIES = ["Consignor", "Consignee", "Driver", "Office"] as const;
export type LrCopy = (typeof LR_COPIES)[number];

export interface DemoTrip {
  lrNo: string;
  from: string;
  to: string;
  status: "in_transit" | "delivered";
  vehicleNo: string;
  /**
   * Every milestone the trip will have, not just the ones that have happened.
   * A consignee checking a running trip wants to know what is still to come as
   * much as what is done, so the pending rows are rendered greyed rather than
   * omitted — the card shows the shape of the whole journey either way. Pending
   * rows carry an expectation ("Expected 08-09-2026, evening") or nothing at
   * all, which is why `place` is optional.
   */
  events: { label: string; at: string; place?: string; pending?: true }[];
  pod: { file: string; at: string } | null;
}

/**
 * Two trips so the tracking demo can show both ends of the story: one still
 * running (no POD yet) and one closed (POD downloadable).
 */
export const DEMO_TRIPS: Record<string, DemoTrip> = {
  "LF-2627-000412": {
    lrNo: "LF-2627-000412",
    from: "Bengaluru",
    to: "Chennai",
    status: "delivered",
    vehicleNo: "KA 51 AB 4471",
    events: [
      { label: "LR created", at: "03-09-2026 09:14", place: "Bengaluru" },
      { label: "Loaded", at: "03-09-2026 11:02", place: "Peenya, Bengaluru" },
      { label: "Departed", at: "03-09-2026 12:30", place: "Hosur Road" },
      { label: "Reached destination", at: "03-09-2026 20:48", place: "Ambattur, Chennai" },
      { label: "Unloaded — POD signed", at: "04-09-2026 07:35", place: "Ambattur, Chennai" },
    ],
    pod: { file: "POD-LF-2627-000412.pdf", at: "04-09-2026 07:35" },
  },
  "LF-2627-000418": {
    lrNo: "LF-2627-000418",
    from: "Bengaluru",
    to: "Hyderabad",
    status: "in_transit",
    vehicleNo: "KA 05 MK 2210",
    events: [
      { label: "LR created", at: "07-09-2026 08:50", place: "Bengaluru" },
      { label: "Loaded", at: "07-09-2026 10:35", place: "Bommasandra, Bengaluru" },
      { label: "Departed", at: "07-09-2026 11:40", place: "NH 44" },
      { label: "Reached destination", at: "Expected 08-09-2026, evening", pending: true },
      { label: "Unloaded — POD signed", at: "", pending: true },
    ],
    pod: null,
  },
};
