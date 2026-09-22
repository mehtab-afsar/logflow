import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verify";
import { ContractsTable, type ContractRow } from "@/features/masters/components/ContractsTable";

export const dynamic = "force-dynamic";

export default async function ContractsPage() {
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");

  const canWrite = ["owner", "dispatcher"].includes(auth.ctx.role);
  const canDelete = auth.ctx.role === "owner";

  const supabase = await createClient();
  const [{ data: contracts }, { data: parties }] = await Promise.all([
    supabase
      .from("rate_contracts")
      .select(
        "id, counterparty_type, party_id, route_origin_city, route_destination_city, vehicle_type, freight_basis, rate, valid_from, valid_to, notes",
      )
      .is("deleted_at", null)
      .order("valid_from", { ascending: false }),
    supabase.from("parties").select("id, name").is("deleted_at", null).order("name"),
  ]);

  return (
    <div className="space-y-5 p-6">
      <header>
        <h1 className="text-xl font-semibold">Contracts</h1>
        <p className="text-sm text-ink-3">
          Standing rates with a consignor (what we charge them) or a vendor (what we pay them).
          Suggested when a matching LR is created — never applied automatically.
        </p>
      </header>

      <ContractsTable
        rows={(contracts ?? []).map((c) => ({ ...c, rate: Number(c.rate) }) as ContractRow)}
        parties={parties ?? []}
        canWrite={canWrite}
        canDelete={canDelete}
      />
    </div>
  );
}
