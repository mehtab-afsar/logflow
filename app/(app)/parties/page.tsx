import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verify";
import { PartiesTable } from "@/features/masters/components/PartiesTable";

export const dynamic = "force-dynamic";

export default async function PartiesPage() {
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");

  const canWrite = ["owner", "dispatcher"].includes(auth.ctx.role);
  const canDelete = auth.ctx.role === "owner";

  const supabase = await createClient();
  const { data: parties } = await supabase
    .from("parties")
    .select("id, name, gstin, state_code, phone, email, addresses, party_role")
    .is("deleted_at", null)
    .order("name");

  return (
    <div className="space-y-5 p-6">
      <header>
        <h1 className="text-xl font-semibold">Parties</h1>
        <p className="text-sm text-ink-3">
          Consignors and consignees. The GSTIN sets the place of supply, which decides IGST
          versus CGST and SGST on every lorry receipt.
        </p>
      </header>

      <PartiesTable
        rows={(parties ?? []).map((p) => ({
          ...p,
          addresses: (p.addresses ?? []) as { city?: string }[],
        }))}
        canWrite={canWrite}
        canDelete={canDelete}
      />
    </div>
  );
}
