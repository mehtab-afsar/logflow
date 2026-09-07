import Link from "next/link";
import { AlertTriangle, Clock, FileWarning, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verify";
import { redirect } from "next/navigation";
import { KpiStrip, money } from "@/features/dashboard/components/KpiStrip";
import { StatusPill } from "@/features/consignments/components/StatusPill";
import { formatDate, timeAgo, daysUntil } from "@/lib/india/format";
import type { Status } from "@/lib/consignments/state-machine";

export const dynamic = "force-dynamic";

/** Columns shown on the Today board, in the order work actually flows. */
const BOARD: Status[] = ["dispatched", "in_transit", "delivered", "pod_verified"];

export default async function DashboardPage() {
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");

  const supabase = await createClient();

  const [{ data: active }, { data: lastEvents }, { data: exceptions }, { data: vehicles }, { data: unbilled }] =
    await Promise.all([
      supabase
        .from("consignments")
        .select("id, lr_no, status, origin_city, destination_city, updated_at, vehicle_id, bill_id")
        .in("status", BOARD)
        .order("updated_at", { ascending: false })
        .limit(200),
      // Last real-world event per trip. updated_at is a row-write timestamp and
      // would read "just now" for every card straight after a seed or an
      // import — useless as a staleness signal.
      supabase
        .from("consignment_exceptions")
        .select("id, last_event_at"),
      supabase
        .from("consignment_exceptions")
        .select("id, lr_no, status, is_stale, pod_unverified_overdue, ewb_expiring, last_event_at, ewb_valid_until")
        .or("is_stale.eq.true,pod_unverified_overdue.eq.true,ewb_expiring.eq.true")
        .limit(25),
      supabase
        .from("vehicles")
        .select("id, reg_number, fitness_expiry, insurance_expiry, permit_expiry, puc_expiry, rc_expiry")
        .is("deleted_at", null),
      supabase
        .from("consignments")
        .select("taxable_value")
        .in("status", ["delivered", "pod_verified"])
        .is("bill_id", null),
    ]);

  const podsPending = (active ?? []).filter((c) => c.status === "delivered").length;
  const unbilledTotal = (unbilled ?? []).reduce((s, r) => s + Number(r.taxable_value ?? 0), 0);

  const expiringSoon = (vehicles ?? []).filter((v) => {
    const soonest = [v.fitness_expiry, v.insurance_expiry, v.permit_expiry, v.puc_expiry, v.rc_expiry]
      .map(daysUntil)
      .filter((d): d is number => d !== null);
    if (soonest.length === 0) return false;
    return Math.min(...soonest) <= 30;
  }).length;

  const vehicleById = new Map((vehicles ?? []).map((v) => [v.id, v.reg_number]));
  const lastEventById = new Map((lastEvents ?? []).map((e) => [e.id, e.last_event_at]));

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Today</h1>
        <p className="text-sm text-neutral-500">{formatDate(new Date())}</p>
      </header>

      <KpiStrip
        items={[
          { label: "Active trips", value: String(active?.length ?? 0) },
          { label: "PODs pending", value: String(podsPending), hint: "delivered, not yet verified" },
          { label: "Unbilled freight", value: money(unbilledTotal) },
          { label: "Documents expiring", value: String(expiringSoon), hint: "within 30 days" },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        {/* Today board */}
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {BOARD.map((status) => {
            const cards = (active ?? []).filter((c) => c.status === status);
            return (
              <div key={status} className="rounded-[10px] border bg-white">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <StatusPill status={status} />
                  <span className="tabular text-sm text-neutral-500">{cards.length}</span>
                </div>
                <div className="space-y-2 p-2">
                  {cards.length === 0 && (
                    <p className="px-1 py-6 text-center text-xs text-neutral-400">Nothing here</p>
                  )}
                  {cards.map((c) => (
                    <Link
                      key={c.id}
                      href={`/consignments/${c.id}`}
                      className="block rounded-md border p-2.5 transition-colors hover:bg-neutral-50"
                    >
                      <p className="font-mono text-[13px] font-medium">{c.lr_no}</p>
                      <p className="mt-0.5 truncate text-xs text-neutral-600">
                        {c.origin_city} → {c.destination_city}
                      </p>
                      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-neutral-400">
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          <Clock className="size-3 shrink-0" strokeWidth={1.5} />
                          {timeAgo(lastEventById.get(c.id) ?? c.updated_at)}
                        </span>
                        {c.vehicle_id && (
                          <span className="whitespace-nowrap font-mono">
                            {vehicleById.get(c.vehicle_id)}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        {/* Exceptions */}
        <aside className="rounded-[10px] border bg-white">
          <h2 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
            <AlertTriangle className="size-4 text-amber-600" strokeWidth={1.5} />
            Needs attention
          </h2>
          <ul className="divide-y">
            {(exceptions ?? []).length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-neutral-400">
                Nothing needs attention
              </li>
            )}
            {(exceptions ?? []).map((e) => (
              <li key={e.id}>
                <Link href={`/consignments/${e.id}`} className="block px-4 py-3 hover:bg-neutral-50">
                  <p className="font-mono text-[13px]">{e.lr_no}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-neutral-600">
                    {e.is_stale && (
                      <>
                        <Clock className="size-3 text-amber-600" strokeWidth={1.5} />
                        No update since {timeAgo(e.last_event_at)}
                      </>
                    )}
                    {e.pod_unverified_overdue && (
                      <>
                        <FileWarning className="size-3 text-amber-600" strokeWidth={1.5} />
                        POD waiting to be checked
                      </>
                    )}
                    {e.ewb_expiring && (
                      <>
                        <ShieldAlert className="size-3 text-red-600" strokeWidth={1.5} />
                        E-way bill expires soon
                      </>
                    )}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
