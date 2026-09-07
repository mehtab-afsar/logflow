/**
 * GST computation for a goods transport agency (GTA), post GST 2.0 (Sept 2025).
 *
 * A GTA is on exactly one of three footings, set per organisation:
 *
 *   rcm     Reverse charge. The GTA charges NO GST on the lorry receipt; the
 *           recipient pays it directly. Most fleets under ~20 trucks. The LR
 *           must carry the statutory note or the customer's books reject it.
 *   fcm_5   Forward charge at 5%, without input tax credit.
 *   fcm_18  Forward charge at 18%, with input tax credit.
 *
 * The old 12% slab no longer exists. Printing a wrong or stale tax line makes
 * the LR unusable for the customer, which is why this is a pure, exhaustively
 * tested function with no I/O and no clock.
 *
 * Intra-state (supplier state === place of supply) splits into CGST + SGST.
 * Inter-state is a single IGST line. Place of supply for a registered
 * recipient is the consignee's state.
 */
import { assertPaise } from "@/lib/money";

export type TaxMode = "rcm" | "fcm_5" | "fcm_18";

export interface TaxInput {
  /** freight + loading + unloading + detention + other, in integer paise. */
  taxableValuePaise: number;
  mode: TaxMode;
  /** The organisation's registered GST state code, 2 digits, e.g. '29'. */
  supplierStateCode: string;
  /** Place of supply — the consignee's state code. */
  placeOfSupplyStateCode: string;
  /** Per-LR flag: agricultural produce, milk, salt, food grain, relief material. */
  exemptGoods: boolean;
}

export interface TaxResult {
  taxableValuePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalTaxPaise: number;
  invoiceTotalPaise: number;
  ratePct: 0 | 5 | 18;
  rateLabel: string;
  isInterState: boolean;
  /** Why the amounts are what they are. Drives which block the PDF prints. */
  reason: "rcm" | "exempt" | "intra_state" | "inter_state";
  /** Statutory note to print, or null when there is nothing to say. */
  note: string | null;
}

/** Goes on statutory paper. Guarded byte-exact by a test. */
export const RCM_NOTE =
  "GST payable by recipient under reverse charge (Notification 13/2017-CT(R))";

export const EXEMPT_NOTE = "Exempted goods — no GST";

const RATE_BY_MODE: Record<TaxMode, 0 | 5 | 18> = {
  rcm: 0,
  fcm_5: 5,
  fcm_18: 18,
};

const STATE_CODE = /^[0-9]{2}$/;

export function computeTax(input: TaxInput): TaxResult {
  const { taxableValuePaise, mode, supplierStateCode, placeOfSupplyStateCode, exemptGoods } = input;

  assertPaise(taxableValuePaise);
  if (taxableValuePaise < 0) {
    throw new Error(`computeTax: taxable value cannot be negative (got ${taxableValuePaise} paise)`);
  }
  if (!STATE_CODE.test(supplierStateCode)) {
    throw new Error(`computeTax: invalid supplier state code '${supplierStateCode}' (expected 2 digits)`);
  }
  if (!STATE_CODE.test(placeOfSupplyStateCode)) {
    throw new Error(`computeTax: invalid place of supply state code '${placeOfSupplyStateCode}' (expected 2 digits)`);
  }

  const isInterState = supplierStateCode !== placeOfSupplyStateCode;

  const zero = (reason: TaxResult["reason"], note: string | null): TaxResult => ({
    taxableValuePaise,
    cgstPaise: 0,
    sgstPaise: 0,
    igstPaise: 0,
    totalTaxPaise: 0,
    invoiceTotalPaise: taxableValuePaise,
    ratePct: 0,
    rateLabel: "0%",
    isInterState,
    reason,
    note,
  });

  // Order matters. Exemption is checked BEFORE mode: an exempt consignment
  // under RCM prints no RCM note, because there is no liability to shift.
  if (exemptGoods) return zero("exempt", EXEMPT_NOTE);
  if (mode === "rcm") return zero("rcm", RCM_NOTE);

  const ratePct = RATE_BY_MODE[mode];

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  if (isInterState) {
    igstPaise = Math.round((taxableValuePaise * ratePct) / 100);
  } else {
    // Each half rounds independently, so their sum can differ from the single
    // IGST figure by one paisa on odd values. That is correct, and it is what
    // Tally does. Covered by a test.
    const half = Math.round((taxableValuePaise * ratePct) / 200);
    cgstPaise = half;
    sgstPaise = half;
  }

  const totalTaxPaise = cgstPaise + sgstPaise + igstPaise;

  return {
    taxableValuePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    totalTaxPaise,
    invoiceTotalPaise: taxableValuePaise + totalTaxPaise,
    ratePct,
    rateLabel: `${ratePct}%`,
    isInterState,
    reason: isInterState ? "inter_state" : "intra_state",
    note: null,
  };
}
