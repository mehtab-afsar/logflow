import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verify";
import { LedgerTable, type LedgerRow } from "@/features/ledger/components/LedgerTable";

export const dynamic = "force-dynamic";

/**
 * Outstanding is never stored — party_outstanding() computes it live from
 * ledger_entries. This page's own job is just: which parties have any
 * entries at all, then one outstanding lookup per party.
 */
export default async function PaymentsPage() {
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");

  const canWrite = ["owner", "accounts"].includes(auth.ctx.role);

  const supabase = await createClient();
  const { data: entryParties } = await supabase
    .from("ledger_entries")
    .select("party_id, counterparty_type");

  const partyIds = [...new Set((entryParties ?? []).map((e) => e.party_id))];
  const counterpartyType = new Map((entryParties ?? []).map((e) => [e.party_id, e.counterparty_type]));

  const [{ data: parties }, outstandings] = await Promise.all([
    partyIds.length
      ? supabase.from("parties").select("id, name").in("id", partyIds)
      : Promise.resolve({ data: [] }),
    Promise.all(
      partyIds.map((party_id) => supabase.rpc("party_outstanding", { p_party_id: party_id })),
    ),
  ]);

  const nameOf = new Map((parties ?? []).map((p) => [p.id, p.name]));

  const rows: LedgerRow[] = partyIds
    .map((party_id, i) => {
      const o = outstandings[i].data as {
        outstanding: number; total_charged: number; total_paid: number;
        entries: { id: string; entry_type: "charge" | "payment"; amount: number; payment_mode: string | null; entered_at: string }[];
      } | null;
      if (!o) return null;
      return {
        partyId: party_id,
        name: nameOf.get(party_id) ?? "Unknown party",
        counterpartyType: (counterpartyType.get(party_id) ?? "consignor") as "consignor" | "vendor",
        outstanding: Number(o.outstanding ?? 0),
        entries: o.entries ?? [],
      };
    })
    .filter((r): r is LedgerRow => r !== null && r.outstanding !== 0)
    .sort((a, b) => Math.abs(b.outstanding) - Math.abs(a.outstanding));

  return (
    <div className="space-y-5 p-6">
      <header>
        <h1 className="text-xl font-semibold">Payments</h1>
        <p className="text-sm text-ink-3">
          What&apos;s outstanding, in either direction — a consignor who owes for a bill, or a
          vendor who&apos;s owed for a trip. Computed live from every charge and payment, never
          stored as a running balance.
        </p>
      </header>

      <LedgerTable rows={rows} canWrite={canWrite} />
    </div>
  );
}
