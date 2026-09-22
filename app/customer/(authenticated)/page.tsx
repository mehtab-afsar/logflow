import Link from "next/link";
import { verifyCustomerAuth } from "@/lib/auth/verify-customer";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/features/consignments/components/StatusPill";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/india/format";
import type { Status } from "@/lib/consignments/state-machine";

export const dynamic = "force-dynamic";

export default async function CustomerShipmentsPage() {
  const auth = await verifyCustomerAuth();
  if (!auth.ok) return null; // layout already redirects — this satisfies TS

  const supabase = await createClient();
  const { data: shipments } = await supabase
    .from("consignments")
    .select("id, lr_no, lr_date, status, origin_city, destination_city, invoice_total")
    .order("lr_date", { ascending: false });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold">Your shipments</h1>
        <p className="text-sm text-ink-3">Every lorry receipt booked in your name.</p>
      </header>

      {!shipments || shipments.length === 0 ? (
        <div className="rounded-[10px] border bg-white px-3 py-16 text-center">
          <p className="text-ink-3">No shipments yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-paper text-left text-xs text-ink-3">
              <tr>
                <th className="px-3 py-2 font-medium">LR no.</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Route</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Freight</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shipments.map((s) => (
                <tr key={s.id} className="row-dense hover:bg-paper">
                  <td className="px-3">
                    <Link href={`/customer/${s.id}`} className="font-mono font-medium text-indigo-ink hover:text-indigo-hover">
                      {s.lr_no}
                    </Link>
                  </td>
                  <td className="px-3 text-ink-2">{formatDate(s.lr_date)}</td>
                  <td className="px-3 text-ink-2">{s.origin_city} → {s.destination_city}</td>
                  <td className="px-3"><StatusPill status={s.status as Status} /></td>
                  <td className="px-3 text-right tabular">{formatINR(Math.round(Number(s.invoice_total) * 100))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
