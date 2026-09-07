import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verify";
import { formatDate } from "@/lib/india/format";
import { formatINR } from "@/lib/money";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function BillsPage() {
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");

  const supabase = await createClient();
  const [{ data: bills }, { data: ready }] = await Promise.all([
    supabase
      .from("freight_bills")
      .select("id, bill_no, bill_date, party_snapshot, taxable_value, total_amount")
      .order("bill_date", { ascending: false })
      .limit(100),
    supabase
      .from("consignments")
      .select("id, lr_no, consignor_snapshot, taxable_value, branch_id, consignor_party_id")
      .eq("status", "pod_verified")
      .is("bill_id", null),
  ]);

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Freight bills</h1>
        <p className="text-sm text-neutral-500">
          {(ready ?? []).length} verified {(ready ?? []).length === 1 ? "consignment is" : "consignments are"} ready to bill
        </p>
      </header>

      {(ready ?? []).length > 0 && (
        <section className="rounded-[10px] border bg-white p-5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">Ready to bill</h2>
          <ul className="mt-3 divide-y text-sm">
            {(ready ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <Link href={`/consignments/${c.id}`} className="font-mono hover:underline">
                  {c.lr_no}
                </Link>
                <span className="truncate px-3 text-neutral-600">
                  {(c.consignor_snapshot as { name?: string })?.name}
                </span>
                <span className="tabular">{formatINR(Math.round(Number(c.taxable_value) * 100))}</span>
              </li>
            ))}
          </ul>
          <Button asChild className="mt-4">
            <Link href="/bills/new">Generate bill</Link>
          </Button>
        </section>
      )}

      <div className="overflow-x-auto rounded-[10px] border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Bill no.</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Party</th>
              <th className="px-3 py-2 text-right font-medium">Taxable</th>
              <th className="px-3 py-2 text-right font-medium">Total</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {(bills ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-16 text-center text-neutral-500">
                  No bills yet. Verify a POD to make a consignment billable.
                </td>
              </tr>
            )}
            {(bills ?? []).map((b) => (
              <tr key={b.id} className="row-dense hover:bg-neutral-50">
                <td className="px-3 font-mono font-medium">{b.bill_no}</td>
                <td className="px-3 text-neutral-600">{formatDate(b.bill_date)}</td>
                <td className="max-w-[240px] truncate px-3">
                  {(b.party_snapshot as { name?: string })?.name ?? "—"}
                </td>
                <td className="px-3 text-right">{formatINR(Math.round(Number(b.taxable_value) * 100))}</td>
                <td className="px-3 text-right font-medium">{formatINR(Math.round(Number(b.total_amount) * 100))}</td>
                <td className="space-x-3 whitespace-nowrap px-3 text-right">
                  <a href={`/api/bills/${b.id}/invoice.pdf`} target="_blank" rel="noreferrer" className="text-primary underline">PDF</a>
                  <a href={`/api/bills/${b.id}/tally.csv`} className="text-primary underline">CSV</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
