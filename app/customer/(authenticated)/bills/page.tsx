import { verifyCustomerAuth } from "@/lib/auth/verify-customer";
import { createClient } from "@/lib/supabase/server";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/india/format";

export const dynamic = "force-dynamic";

export default async function CustomerBillsPage() {
  const auth = await verifyCustomerAuth();
  if (!auth.ok) return null;

  const supabase = await createClient();
  const [{ data: bills }, { data: outstanding }] = await Promise.all([
    supabase.from("freight_bills").select("id, bill_no, bill_date, total_amount").order("bill_date", { ascending: false }),
    supabase.rpc("customer_outstanding"),
  ]);

  const summary = outstanding as { outstanding: number; total_charged: number; total_paid: number } | null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Your bills</h1>
        <p className="text-sm text-ink-3">Every freight bill raised against you, and what&apos;s outstanding.</p>
      </header>

      <section className="rounded-[10px] border bg-white p-5">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-3">Outstanding</h2>
        <p className="text-2xl font-semibold tabular text-ink">
          {formatINR(Math.round(Number(summary?.outstanding ?? 0) * 100))}
        </p>
        <p className="mt-1 text-xs text-ink-3">
          {formatINR(Math.round(Number(summary?.total_charged ?? 0) * 100))} billed ·{" "}
          {formatINR(Math.round(Number(summary?.total_paid ?? 0) * 100))} paid
        </p>
      </section>

      {!bills || bills.length === 0 ? (
        <div className="rounded-[10px] border bg-white px-3 py-16 text-center">
          <p className="text-ink-3">No bills yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-paper text-left text-xs text-ink-3">
              <tr>
                <th className="px-3 py-2 font-medium">Bill no.</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {bills.map((b) => (
                <tr key={b.id} className="row-dense">
                  <td className="px-3 font-mono font-medium">{b.bill_no}</td>
                  <td className="px-3 text-ink-2">{formatDate(b.bill_date)}</td>
                  <td className="px-3 text-right tabular">{formatINR(Math.round(Number(b.total_amount) * 100))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
