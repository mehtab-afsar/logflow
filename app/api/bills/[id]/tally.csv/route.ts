import { type NextRequest } from "next/server";
import { verifyAuth } from "@/lib/auth/verify";
import { createClient } from "@/lib/supabase/server";
import { apiErr } from "@/lib/api/response";
import { toTallyCsv, type TallyRow } from "@/lib/billing/tally-csv";
import { formatDate } from "@/lib/india/format";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await verifyAuth();
  if (!auth.ok) return apiErr(auth.error, auth.status);

  const supabase = await createClient();
  const { data: bill } = await supabase
    .from("freight_bills")
    .select("id, bill_no, bill_date, party_snapshot, taxable_value, cgst_amount, sgst_amount, igst_amount")
    .eq("id", id)
    .single();

  if (!bill) return apiErr("Not found", 404);

  const { data: lines } = await supabase
    .from("bill_lines")
    .select("amount, consignments(lr_no, origin_city, destination_city)")
    .eq("bill_id", id);

  const party = (bill.party_snapshot ?? {}) as { name?: string };

  const rows: TallyRow[] = (lines ?? []).map((l, i) => {
    const c = l.consignments as unknown as {
      lr_no: string; origin_city: string; destination_city: string;
    };
    return {
      date: formatDate(bill.bill_date),
      voucherType: "Sales",
      voucherNo: bill.bill_no,
      partyLedger: party.name ?? "Unknown party",
      ledger: "Freight Income",
      amount: Number(l.amount ?? 0),
      // Tax sits once on the bill, so it is carried on the first line only —
      // otherwise Tally would post it once per lorry receipt.
      cgst: i === 0 ? Number(bill.cgst_amount ?? 0) : 0,
      sgst: i === 0 ? Number(bill.sgst_amount ?? 0) : 0,
      igst: i === 0 ? Number(bill.igst_amount ?? 0) : 0,
      narration: c ? `${c.lr_no} ${c.origin_city} to ${c.destination_city}` : bill.bill_no,
    };
  });

  return new Response(toTallyCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${bill.bill_no}.csv"`,
    },
  });
}
