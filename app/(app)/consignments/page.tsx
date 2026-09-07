import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verify";
import { StatusPill } from "@/features/consignments/components/StatusPill";
import { formatDate } from "@/lib/india/format";
import { formatINR } from "@/lib/money";
import { STATUSES, type Status } from "@/lib/consignments/state-machine";
import { STATUS_TOKENS } from "@/lib/design/tokens";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const sp = await searchParams; // Next 16: searchParams is a Promise
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");

  const page = Math.max(1, Number(sp.page ?? 1));
  const supabase = await createClient();

  let query = supabase
    .from("consignments")
    .select(
      "id, lr_no, lr_date, status, origin_city, destination_city, consignor_snapshot, taxable_value, freight_terms",
      { count: "exact" },
    )
    .order("lr_date", { ascending: false })
    .order("lr_no", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (sp.status && STATUSES.includes(sp.status as Status)) {
    query = query.eq("status", sp.status);
  }
  if (sp.q) query = query.ilike("lr_no", `%${sp.q}%`);

  const { data: rows, count } = await query;
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = { status: sp.status, q: sp.q, page: sp.page, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
    return `/consignments${next.toString() ? `?${next}` : ""}`;
  };

  return (
    <div className="space-y-4 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Lorry receipts</h1>
          <p className="text-sm text-neutral-500">
            {total} {total === 1 ? "record" : "records"}
          </p>
        </div>
        <Button asChild>
          <Link href="/consignments/new">
            <Plus className="size-4" strokeWidth={1.5} />
            New LR
          </Link>
        </Button>
      </header>

      {/* Filter chips — status is the filter dispatchers actually use. */}
      <div className="flex flex-wrap gap-1.5">
        <Link
          href={href({ status: undefined, page: undefined })}
          className={`rounded-full border px-2.5 py-1 text-xs ${
            !sp.status ? "border-primary bg-primary text-primary-foreground" : "bg-white"
          }`}
        >
          All
        </Link>
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={href({ status: s, page: undefined })}
            className={`rounded-full border px-2.5 py-1 text-xs ${
              sp.status === s ? "border-primary bg-primary text-primary-foreground" : "bg-white"
            }`}
          >
            {STATUS_TOKENS[s].label}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[10px] border bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">LR No.</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Consignor</th>
              <th className="px-3 py-2 font-medium">Route</th>
              <th className="px-3 py-2 text-right font-medium">Freight</th>
              <th className="px-3 py-2 font-medium">Terms</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(rows ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-16 text-center">
                  <p className="text-neutral-500">No lorry receipts yet.</p>
                  <Button asChild className="mt-4">
                    <Link href="/consignments/new">Create your first LR</Link>
                  </Button>
                </td>
              </tr>
            )}
            {(rows ?? []).map((c) => (
              <tr key={c.id} className="row-dense hover:bg-neutral-50">
                <td className="px-3">
                  <Link href={`/consignments/${c.id}`} className="font-mono font-medium hover:underline">
                    {c.lr_no}
                  </Link>
                </td>
                <td className="px-3 text-neutral-600">{formatDate(c.lr_date)}</td>
                <td className="max-w-[220px] truncate px-3">
                  {(c.consignor_snapshot as { name?: string })?.name ?? "—"}
                </td>
                <td className="px-3 text-neutral-600">
                  {c.origin_city} → {c.destination_city}
                </td>
                <td className="px-3 text-right">{formatINR(Math.round(Number(c.taxable_value ?? 0) * 100))}</td>
                <td className="px-3 text-neutral-600">{c.freight_terms.replace(/_/g, " ")}</td>
                <td className="px-3">
                  <StatusPill status={c.status as Status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={href({ page: String(page - 1) })} className="rounded-md border bg-white px-3 py-1.5">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={href({ page: String(page + 1) })} className="rounded-md border bg-white px-3 py-1.5">
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
