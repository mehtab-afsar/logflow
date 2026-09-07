import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { apiErr } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { qrDataUrl } from "@/lib/pdf/qr";
import { getOrRender, lrPdfPath } from "@/lib/pdf/cache";
import { LrDocument, type CopyKey, type LrPdfData } from "@/lib/pdf/LrDocument";
import { env } from "@/lib/env";

export const runtime = "nodejs";   // fontkit needs Node, not Edge
export const maxDuration = 30;

registerPdfFonts();

const VALID_COPIES = new Set(["all", "consignor", "consignee", "driver", "office"]);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const sp = req.nextUrl.searchParams;
  const size = sp.get("size") === "a5" ? "a5" : "a4";
  const copiesParam = sp.get("copies") ?? "all";
  if (!VALID_COPIES.has(copiesParam)) return apiErr("Unknown copy requested", 400);
  const copies = copiesParam as CopyKey | "all";

  const supabase = await createClient();

  // User-scoped read: RLS is the tenancy check. A cross-org id yields no row.
  const { data: c } = await supabase
    .from("consignments")
    // One string literal, not a concatenation: supabase-js parses the select
    // list at the type level and `+` erases it to plain `string`.
    .select(`id, org_id, lr_no, lr_date, doc_version, tracking_token, consignor_snapshot,
      consignee_snapshot, origin_city, destination_city, distance_km, cargo_description,
      packages_count, packages_unit, actual_weight_kg, charged_weight_kg, declared_value,
      hsn_code, customer_invoice_no, customer_invoice_date, ewb_no, ewb_valid_until,
      freight, loading, unloading, detention, other_charges, taxable_value, cgst_amount,
      sgst_amount, igst_amount, invoice_total, tax_rate_pct, tax_snapshot, freight_terms,
      advance_received, branch_id, vehicle_id, driver_id, delivery_instructions, remarks`)
    .eq("id", id)
    .single();

  if (!c) return apiErr("Not found", 404);

  const [{ data: org }, { data: branch }, { data: vehicle }, { data: driver }] = await Promise.all([
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
  ]);

  if (!org || !branch) return apiErr("Not found", 404);

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
    freight: Number(c.freight ?? 0),
    loading: Number(c.loading ?? 0),
    unloading: Number(c.unloading ?? 0),
    detention: Number(c.detention ?? 0),
    other_charges: Number(c.other_charges ?? 0),
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

  try {
    const qr = await qrDataUrl(`${env.appUrl}/track/${c.tracking_token}`);
    const path = lrPdfPath(c.org_id, c.id, c.doc_version, size, copies);
    const { buffer, cached } = await getOrRender(path, () => (
      <LrDocument lr={lr} qr={qr} size={size} copies={copies} />
    ));

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${c.lr_no}.pdf"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-Pdf-Cache": cached ? "hit" : "miss",
      },
    });
  } catch (err) {
    log.error("LR PDF render failed", { id, err: String(err) });
    return apiErr("Could not generate the lorry receipt", 500);
  }
}
