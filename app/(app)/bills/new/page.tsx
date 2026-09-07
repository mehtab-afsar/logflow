import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verify";
import { BillBuilder, type Billable } from "@/features/billing/components/BillBuilder";

export const dynamic = "force-dynamic";

export default async function NewBillPage() {
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");
  if (!["owner", "accounts"].includes(auth.ctx.role)) redirect("/bills");

  const supabase = await createClient();
  const { data } = await supabase
    .from("consignments")
    .select("id, lr_no, branch_id, consignor_party_id, consignor_snapshot, consignee_snapshot, taxable_value")
    .eq("status", "pod_verified")
    .is("bill_id", null)
    .order("lr_no");

  const rows: Billable[] = (data ?? []).map((c) => ({
    id: c.id,
    lr_no: c.lr_no,
    branch_id: c.branch_id,
    consignor_party_id: c.consignor_party_id ?? "",
    consignor_name: (c.consignor_snapshot as { name?: string })?.name ?? "—",
    consignee_state: (c.consignee_snapshot as { state_code?: string })?.state_code ?? "—",
    taxable_value: Number(c.taxable_value ?? 0),
  }));

  return (
    <div className="space-y-5 p-6">
      <Link href="/bills" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" strokeWidth={1.5} />
        Freight bills
      </Link>
      <header>
        <h1 className="text-xl font-semibold">Generate a freight bill</h1>
        <p className="text-sm text-ink-3">
          One bill covers a single consignor, branch and destination state.
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="rounded-[10px] border bg-white p-16 text-center text-ink-3">
          Nothing is ready to bill. Verify a proof of delivery first.
        </p>
      ) : (
        <BillBuilder rows={rows} />
      )}
    </div>
  );
}
