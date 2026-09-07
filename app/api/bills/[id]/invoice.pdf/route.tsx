import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { apiErr } from "@/lib/api/response";
import { log } from "@/lib/logger";
import { registerPdfFonts } from "@/lib/pdf/fonts";
import { getOrRender, billPdfPath } from "@/lib/pdf/cache";
import { InvoiceDocument, type InvoicePdfData } from "@/lib/pdf/InvoiceDocument";

export const runtime = "nodejs";
export const maxDuration = 30;

registerPdfFonts();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const { data: bill } = await supabase
    .from("freight_bills")
    .select(`id, org_id, bill_no, bill_date, party_snapshot, taxable_value,
      cgst_amount, sgst_amount, igst_amount, total_amount, tax_rate_pct, tax_snapshot, notes`)
    .eq("id", id)
    .single();

  if (!bill) return apiErr("Not found", 404);

  const [{ data: org }, { data: lines }] = await Promise.all([
    supabase.from("organisations")
      .select("legal_name, gstin, transin, address, bank_details")
      .eq("id", bill.org_id).single(),
    supabase.from("bill_lines")
      .select("amount, consignments(lr_no, lr_date, origin_city, destination_city)")
      .eq("bill_id", id),
  ]);

  if (!org) return apiErr("Not found", 404);

  const snapshot = (bill.tax_snapshot ?? {}) as { reason?: InvoicePdfData["tax_reason"] };

  const data: InvoicePdfData = {
    bill_no: bill.bill_no,
    bill_date: bill.bill_date,
    org,
    bank: (org.bank_details ?? null) as Record<string, string> | null,
    party: (bill.party_snapshot ?? {}) as InvoicePdfData["party"],
    lines: (lines ?? []).map((l) => {
      const c = l.consignments as unknown as {
        lr_no: string; lr_date: string; origin_city: string; destination_city: string;
      };
      return {
        lr_no: c?.lr_no ?? "—",
        lr_date: c?.lr_date ?? bill.bill_date,
        route: c ? `${c.origin_city} → ${c.destination_city}` : "—",
        amount: Number(l.amount ?? 0),
      };
    }),
    taxable_value: Number(bill.taxable_value ?? 0),
    cgst_amount: Number(bill.cgst_amount ?? 0),
    sgst_amount: Number(bill.sgst_amount ?? 0),
    igst_amount: Number(bill.igst_amount ?? 0),
    total_amount: Number(bill.total_amount ?? 0),
    tax_rate_pct: Number(bill.tax_rate_pct ?? 0),
    tax_reason: snapshot.reason ?? "rcm",
    notes: bill.notes,
  };

  try {
    const { buffer, cached } = await getOrRender(billPdfPath(bill.org_id, bill.id), () => (
      <InvoiceDocument bill={data} />
    ));
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${bill.bill_no}.pdf"`,
        "X-Pdf-Cache": cached ? "hit" : "miss",
      },
    });
  } catch (err) {
    log.error("invoice PDF failed", { id, err: String(err) });
    return apiErr("Could not generate the bill", 500);
  }
}
