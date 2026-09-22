import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { LrPdfData } from "@/lib/pdf/LrDocument";

/**
 * The query and shaping behind the LR PDF, extracted so a second caller
 * (the WhatsApp signed-link route) renders the exact same document instead
 * of drifting from a hand-copied second version of this ~60-line query.
 *
 * Takes the session-scoped client — RLS is still the tenancy check here, a
 * cross-org id yields no row, same as the PDF route itself.
 */
export async function loadLrPdfData(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<{ lr: LrPdfData; orgId: string; docVersion: number; lrNo: string; trackingToken: string } | null> {
  const { data: c } = await supabase
    .from("consignments")
    .select(`id, org_id, lr_no, lr_date, doc_version, tracking_token, consignor_snapshot,
      consignee_snapshot, origin_city, destination_city, distance_km, cargo_description,
      packages_count, packages_unit, actual_weight_kg, charged_weight_kg, declared_value,
      hsn_code, customer_invoice_no, customer_invoice_date, ewb_no, ewb_valid_until,
      taxable_value, cgst_amount,
      sgst_amount, igst_amount, invoice_total, tax_rate_pct, tax_snapshot, freight_terms,
      advance_received, branch_id, vehicle_id, driver_id, delivery_instructions, remarks`)
    .eq("id", id)
    .single();

  if (!c) return null;

  const [{ data: org }, { data: branch }, { data: vehicle }, { data: driver }, { data: chargeLines }] = await Promise.all([
    supabase.from("organisations")
      .select("legal_name, gstin, transin, address, state_code, risk_clause")
      .eq("id", c.org_id).single(),
    supabase.from("branches").select("name, city").eq("id", c.branch_id).single(),
    c.vehicle_id
      ? supabase.from("vehicles").select("reg_number").eq("id", c.vehicle_id).single()
      : Promise.resolve({ data: null }),
    c.driver_id
      ? supabase.from("drivers").select("full_name, phone").eq("id", c.driver_id).single()
      : Promise.resolve({ data: null }),
    // Only lines billable to the consignor print on their document — a
    // vendor-only line is none of the consignor's business.
    supabase.from("consignment_charge_lines")
      .select("description, amount, billable_to_consignor, charge_types(label)")
      .eq("consignment_id", id).eq("billable_to_consignor", true).order("created_at"),
  ]);

  if (!org || !branch) return null;

  const snapshot = (c.tax_snapshot ?? {}) as { reason?: LrPdfData["tax_reason"] };

  const lr: LrPdfData = {
    lr_no: c.lr_no,
    lr_date: c.lr_date,
    org,
    branch,
    consignor: (c.consignor_snapshot ?? {}) as Record<string, string | null>,
    consignee: (c.consignee_snapshot ?? {}) as Record<string, string | null>,
    origin_city: c.origin_city,
    destination_city: c.destination_city,
    distance_km: c.distance_km,
    cargo_description: c.cargo_description,
    packages_count: c.packages_count,
    packages_unit: c.packages_unit,
    actual_weight_kg: c.actual_weight_kg,
    charged_weight_kg: c.charged_weight_kg,
    declared_value: Number(c.declared_value ?? 0),
    hsn_code: c.hsn_code,
    customer_invoice_no: c.customer_invoice_no,
    customer_invoice_date: c.customer_invoice_date,
    ewb_no: c.ewb_no,
    ewb_valid_until: c.ewb_valid_until,
    charge_lines: (chargeLines ?? []).map((l) => ({
      label: l.description || (l.charge_types as unknown as { label: string } | null)?.label || "Charge",
      amount: Number(l.amount ?? 0),
    })),
    taxable_value: Number(c.taxable_value ?? 0),
    cgst_amount: Number(c.cgst_amount ?? 0),
    sgst_amount: Number(c.sgst_amount ?? 0),
    igst_amount: Number(c.igst_amount ?? 0),
    invoice_total: Number(c.invoice_total ?? 0),
    tax_rate_pct: Number(c.tax_rate_pct ?? 0),
    tax_reason: snapshot.reason ?? "rcm",
    freight_terms: c.freight_terms,
    advance_received: Number(c.advance_received ?? 0),
    vehicle_no: vehicle?.reg_number ?? null,
    driver_name: driver?.full_name ?? null,
    driver_phone: driver?.phone ?? null,
    delivery_instructions: c.delivery_instructions,
    remarks: c.remarks,
  };

  return { lr, orgId: c.org_id, docVersion: c.doc_version, lrNo: c.lr_no, trackingToken: c.tracking_token };
}
