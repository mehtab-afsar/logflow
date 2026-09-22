import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { verifyCustomerAuth } from "@/lib/auth/verify-customer";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/features/consignments/components/StatusPill";
import { Timeline } from "@/features/tracking/components/Timeline";
import { formatINR } from "@/lib/money";
import { formatDate } from "@/lib/india/format";
import type { Status } from "@/lib/consignments/state-machine";

export const dynamic = "force-dynamic";

/**
 * One shipment, including its timeline — track & trace's authenticated half
 * (the public half, /track/[token], is untouched). Queries consignments and
 * consignment_events directly rather than through track_consignment(): that
 * RPC's whitelist exists to hide money from an anonymous URL holder, which
 * does not apply to a logged-in customer viewing their own shipment — RLS
 * (consignments_select_customer, migration 18) is the boundary here, not a
 * second whitelist.
 */
export default async function CustomerShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await verifyCustomerAuth();
  if (!auth.ok) return null;

  const supabase = await createClient();
  const { data: c } = await supabase
    .from("consignments")
    .select("id, lr_no, lr_date, status, origin_city, destination_city, cargo_description, eta_text, invoice_total, delivered_at, pod_verified_at")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const { data: events } = await supabase
    .from("consignment_events")
    .select("event_time, to_status, milestone, kind, location_name")
    .eq("consignment_id", id)
    .order("event_time", { ascending: true });

  const { data: pod } = await supabase
    .from("consignment_pods")
    .select("id")
    .eq("consignment_id", id)
    .limit(1)
    .maybeSingle();

  return (
    <div className="space-y-5">
      <Link href="/customer" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" strokeWidth={1.5} />
        Your shipments
      </Link>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xl font-semibold">{c.lr_no}</h1>
          <p className="text-sm text-ink-3">
            {c.origin_city} → {c.destination_city} · {formatDate(c.lr_date)}
          </p>
        </div>
        <StatusPill status={c.status as Status} />
      </header>

      <section className="rounded-[10px] border bg-white p-5">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-ink-3">Details</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-ink-3">Cargo</dt>
            <dd className="text-sm text-ink">{c.cargo_description}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-3">Freight</dt>
            <dd className="text-sm tabular text-ink">{formatINR(Math.round(Number(c.invoice_total) * 100))}</dd>
          </div>
          {c.eta_text && (
            <div>
              <dt className="text-xs text-ink-3">ETA</dt>
              <dd className="text-sm text-ink">{c.eta_text}</dd>
            </div>
          )}
          {pod && (
            <div>
              <dt className="text-xs text-ink-3">Proof of delivery</dt>
              <dd className="text-sm text-ink">Uploaded — available from your transporter</dd>
            </div>
          )}
        </dl>
      </section>

      <section className="rounded-[10px] border bg-white p-5">
        <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-ink-3">Progress</h2>
        <Timeline
          events={(events ?? []).map((e) => ({
            at: e.event_time,
            status: e.to_status,
            milestone: e.milestone,
            kind: e.kind,
            place: e.location_name,
          }))}
        />
      </section>
    </div>
  );
}
