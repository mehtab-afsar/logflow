import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { verifyCustomerAuth } from "@/lib/auth/verify-customer";
import { CustomerSignOut } from "@/features/customer/components/CustomerSignOut";

/**
 * The customer portal's own shell — deliberately outside app/(app)'s
 * dispatcher chrome (no sidebar of internal tools, no Kanban board): a
 * consignor needs three things — their shipments, their bills, what they
 * owe — not the whole operations surface.
 */
export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const auth = await verifyCustomerAuth();
  if (!auth.ok) redirect("/customer/login");

  const supabase = await createClient();
  const [{ data: party }, { data: org }] = await Promise.all([
    supabase.from("parties").select("name").eq("id", auth.ctx.partyId).maybeSingle(),
    supabase.from("organisations").select("legal_name").eq("id", auth.ctx.orgId).maybeSingle(),
  ]);

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-[900px] items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-ink">{org?.legal_name ?? "LogiFlow"}</span>
            <nav className="flex items-center gap-4 text-sm text-ink-2">
              <Link href="/customer" className="hover:text-ink">Shipments</Link>
              <Link href="/customer/bills" className="hover:text-ink">Bills</Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-3">{party?.name ?? "Your account"}</span>
            <CustomerSignOut />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[900px] px-6 py-8">{children}</main>
    </div>
  );
}
