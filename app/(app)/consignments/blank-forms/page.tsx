import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verify";
import { BlankFormsPanel } from "@/features/consignments/components/BlankFormsPanel";

export const dynamic = "force-dynamic";

/**
 * The physical checkbook. For the pickup that has nobody nearby who can
 * print or even open a link — a real, gapless LR number reserved ahead of
 * time, printed blank, filled by hand, reconciled here once the truck (or a
 * phone call) brings the details back.
 */
export default async function BlankFormsPage() {
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");
  if (!["owner", "dispatcher"].includes(auth.ctx.role)) {
    redirect("/consignments");
  }

  const supabase = await createClient();
  const [{ data: branches }, { data: reservations }] = await Promise.all([
    supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
    supabase
      .from("lr_blank_reservations")
      .select("id, branch_id, lr_no, reserved_date, batch_id, status, void_reason")
      .in("status", ["reserved", "claimed", "void"])
      .order("lr_no", { ascending: false })
      .limit(200),
  ]);

  return (
    <div className="space-y-5 p-6">
      <Link href="/consignments" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" strokeWidth={1.5} />
        Lorry receipts
      </Link>

      <header>
        <h1 className="text-xl font-semibold">Blank forms</h1>
        <p className="text-sm text-ink-3">
          For a pickup where nobody can print or open a link — reserve real LR numbers, print
          them blank, and reconcile each one here once the paper comes back.
        </p>
      </header>

      <BlankFormsPanel
        branches={branches ?? []}
        reservations={reservations ?? []}
        canWrite={auth.ctx.role === "owner" || auth.ctx.role === "dispatcher"}
      />
    </div>
  );
}
