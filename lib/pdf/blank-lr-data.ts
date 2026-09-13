import type { LrPdfData } from "@/lib/pdf/LrDocument";

/**
 * Builds the same LrPdfData shape a real LR uses, filled only with what a
 * reservation actually knows (the number, its date, the org, the branch) and
 * empty/zero everywhere else — so LrPages renders a blank form through the
 * exact same layout as a real LR, rather than a second hand-drawn version
 * that could drift from what one actually looks like.
 */
export function blankLrData(
  reservation: { lr_no: string; reserved_date: string },
  org: { legal_name: string; gstin: string | null; transin: string | null; address: string | null; state_code: string; risk_clause: string },
  branch: { name: string; city: string | null },
): LrPdfData {
  return {
    lr_no: reservation.lr_no,
    lr_date: reservation.reserved_date,
    org,
    branch,
    consignor: {},
    consignee: {},
    origin_city: "",
    destination_city: "",
    distance_km: null,
    cargo_description: "",
    packages_count: 0,
    packages_unit: "",
    actual_weight_kg: null,
    charged_weight_kg: null,
    declared_value: 0,
    hsn_code: null,
    customer_invoice_no: null,
    customer_invoice_date: null,
    ewb_no: null,
    ewb_valid_until: null,
    freight: 0,
    loading: 0,
    unloading: 0,
    detention: 0,
    other_charges: 0,
    taxable_value: 0,
    cgst_amount: 0,
    sgst_amount: 0,
    igst_amount: 0,
    invoice_total: 0,
    tax_rate_pct: 0,
    tax_reason: "rcm",
    freight_terms: "to_be_billed",
    advance_received: 0,
    vehicle_no: null,
    driver_name: null,
    driver_phone: null,
    delivery_instructions: null,
    remarks: null,
  };
}
