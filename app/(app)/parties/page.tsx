import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verify";

export const dynamic = "force-dynamic";

export default async function PartiesPage() {
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");

  const supabase = await createClient();
  const { data: parties } = await supabase
    .from("parties")
    .select("id, name, gstin, state_code, phone, addresses")
    .is("deleted_at", null)
    .order("name");

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Parties</h1>
        <p className="text-sm text-neutral-500">{parties?.length ?? 0} consignors and consignees</p>
      </header>

      <div className="overflow-x-auto rounded-[10px] border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">GSTIN</th>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium">City</th>
              <th className="px-3 py-2 font-medium">Phone</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(parties ?? []).map((p) => (
              <tr key={p.id} className="row-dense">
                <td className="px-3 font-medium">{p.name}</td>
                <td className="px-3 font-mono text-neutral-600">{p.gstin ?? "—"}</td>
                <td className="px-3 text-neutral-600">{p.state_code ?? "—"}</td>
                <td className="px-3 text-neutral-600">
                  {(p.addresses as { city?: string }[])?.[0]?.city ?? "—"}
                </td>
                <td className="px-3 font-mono text-neutral-600">{p.phone ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
