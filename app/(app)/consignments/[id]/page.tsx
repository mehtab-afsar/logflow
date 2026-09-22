import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyAuth } from "@/lib/auth/verify";
import { StatusPill } from "@/features/consignments/components/StatusPill";
import { TransitionButton } from "@/features/consignments/components/TransitionButton";
import { PhoneInDeliveryButton } from "@/features/consignments/components/PhoneInDeliveryButton";
import { RecordMilestoneButton } from "@/features/consignments/components/RecordMilestoneButton";
import { OfficePodUpload } from "@/features/consignments/components/OfficePodUpload";
import { ShareButtons } from "@/features/consignments/components/ShareButtons";
import { VendorChargePanel, type VendorLedgerEntry } from "@/features/consignments/components/VendorChargePanel";
import { Timeline } from "@/features/tracking/components/Timeline";
import { formatDate, formatDateTime, formatWeight } from "@/lib/india/format";
import { formatINR } from "@/lib/money";
import { RCM_NOTE, EXEMPT_NOTE } from "@/lib/tax";
import { env } from "@/lib/env";
import type { Status } from "@/lib/consignments/state-machine";

export const dynamic = "force-dynamic";

const rupees = (n: unknown) => formatINR(Math.round(Number(n ?? 0) * 100));

export default async function ConsignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");

  const supabase = await createClient();
  const { data: c } = await supabase.from("consignments").select("*").eq("id", id).single();
  if (!c) notFound();

  const [{ data: events }, { data: pods }, { data: expenses }, { data: vehicle }, { data: driver }, { data: consignorParty }] =
    await Promise.all([
      supabase
        .from("consignment_events")
        .select("event_time, to_status, milestone, kind, location_name, payload")
        .eq("consignment_id", id)
        .order("event_time", { ascending: true }),
      supabase
        .from("consignment_pods")
        .select("id, page_no, storage_path, uploaded_at, verified_at")
        .eq("consignment_id", id)
        .order("page_no"),
      supabase
        .from("trip_expenses")
        .select("id, kind, amount, litres, paid_by, spent_at")
        .eq("consignment_id", id)
        .order("spent_at"),
      c.vehicle_id
        ? supabase.from("vehicles").select("reg_number, ownership, owner_party_id").eq("id", c.vehicle_id).single()
        : Promise.resolve({ data: null }),
      c.driver_id
        ? supabase.from("drivers").select("full_name, phone").eq("id", c.driver_id).single()
        : Promise.resolve({ data: null }),
      // The frozen consignor_snapshot deliberately carries no phone — a
      // party's number changing shouldn't retroactively alter what a printed
      // LR says. But "where do we send a WhatsApp message today" wants the
      // CURRENT number, not a historical one, so this is a live lookup.
      c.consignor_party_id
        ? supabase.from("parties").select("phone").eq("id", c.consignor_party_id).single()
        : Promise.resolve({ data: null }),
    ]);

  // The vendor panel only has something to show when this trip actually ran
  // on an attached vehicle with a known owner — a second round-trip because
  // it depends on which vehicle the consignment resolved to above.
  const [{ data: vendorParty }, { data: vendorEntries }] = vehicle?.owner_party_id
    ? await Promise.all([
        supabase.from("parties").select("id, name").eq("id", vehicle.owner_party_id).single(),
        supabase
          .from("ledger_entries")
          .select("id, entry_type, amount, payment_mode, entered_at")
          .eq("counterparty_type", "vendor")
          .eq("ref_type", "trip")
          .eq("ref_id", id)
          .order("entered_at"),
      ])
    : [{ data: null }, { data: null }];

  // Signed server-side after RLS has already authorised the row read.
  const admin = createAdminClient();
  const podUrls = await Promise.all(
    (pods ?? []).map(async (p) => {
      const { data } = await admin.storage.from("pods").createSignedUrl(p.storage_path, 600);
      return { ...p, url: data?.signedUrl ?? null };
    }),
  );

  // Re-sharable driver link: fetched, never re-minted, so the URL already in
  // the driver's WhatsApp thread keeps working.
  const { data: driverToken } = await supabase.rpc("get_trip_link", { p_consignment_id: id });

  const consignor = (c.consignor_snapshot ?? {}) as Record<string, string>;
  const consignee = (c.consignee_snapshot ?? {}) as Record<string, string>;
  const snapshot = (c.tax_snapshot ?? {}) as { reason?: string };

  const settlement = {
    officeAdvance: (expenses ?? []).filter((e) => e.kind === "advance" && e.paid_by === "office")
      .reduce((s, e) => s + Number(e.amount), 0),
    driverPaid: (expenses ?? []).filter((e) => e.kind !== "advance" && e.paid_by === "driver")
      .reduce((s, e) => s + Number(e.amount), 0),
  };

  // The most recent transition into "delivered" is what carries the
  // pod_pending flag, if there is one — reaching pod_verified afterwards is
  // itself the proof a real POD arrived, so this only ever matters while
  // still sitting at "delivered".
  const deliveredEvent = [...(events ?? [])].reverse().find((e) => e.to_status === "delivered");
  const podPending =
    c.status === "delivered" &&
    Boolean((deliveredEvent?.payload as { pod_pending?: boolean } | null)?.pod_pending);
  const milestonesDone = (events ?? [])
    .filter((e) => e.kind === "milestone" && e.milestone)
    .map((e) => e.milestone as string);

  return (
    <div className="space-y-6 p-6">
      <Link href="/consignments" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" strokeWidth={1.5} />
        Lorry receipts
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-xl font-semibold">{c.lr_no}</h1>
            <StatusPill status={c.status as Status} />
            {podPending && (
              // Deliberately colourless — STATUS_TOKENS' own rule is that
              // colour is exclusively status; this is a second axis (an
              // annotation on top of "delivered"), not a status change, and
              // reusing a status colour here would risk being misread as one.
              <span
                title="The driver reported this by phone. The signed physical POD has not reached the office yet."
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-line px-2 py-0.5 text-xs text-ink-3"
              >
                <Phone className="size-3" strokeWidth={2} />
                Phoned in — POD pending
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-3">
            {formatDate(c.lr_date)} · {c.origin_city} → {c.destination_city}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ShareButtons
            consignmentId={c.id}
            lrNo={c.lr_no}
            pdfUrl={`${env.appUrl}/api/consignments/${c.id}/lr.pdf`}
            trackingUrl={`${env.appUrl}/track/${c.tracking_token}`}
            driverUrl={driverToken ? `${env.appUrl}/d/${driverToken}` : null}
            driverPhone={driver?.phone}
            consignorPhone={consignorParty?.phone}
          />
          <RecordMilestoneButton id={c.id} status={c.status as Status} milestonesDone={milestonesDone} />
          <PhoneInDeliveryButton id={c.id} status={c.status as Status} />
          <TransitionButton
            id={c.id}
            status={c.status as Status}
            advanceDefault={Number(c.advance_received ?? 0)}
          />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* Parties */}
          <section className="grid gap-4 rounded-[10px] border bg-white p-5 sm:grid-cols-2">
            <div>
              <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">Consignor</h2>
              <p className="mt-1.5 font-medium">{consignor.name}</p>
              <p className="text-sm text-ink-2">{consignor.address}</p>
              {consignor.gstin && <p className="mt-1 font-mono text-xs text-ink-3">{consignor.gstin}</p>}
            </div>
            <div>
              <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">Consignee</h2>
              <p className="mt-1.5 font-medium">{consignee.name}</p>
              <p className="text-sm text-ink-2">{consignee.address}</p>
              {consignee.gstin && <p className="mt-1 font-mono text-xs text-ink-3">{consignee.gstin}</p>}
            </div>
          </section>

          {/* Cargo & compliance */}
          <section className="rounded-[10px] border bg-white p-5">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-3">
              Cargo &amp; compliance
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
              <Detail label="Description" value={c.cargo_description} />
              <Detail label="Packages" value={`${c.packages_count} ${c.packages_unit}`} />
              <Detail label="Actual weight" value={formatWeight(c.actual_weight_kg)} />
              <Detail label="Charged weight" value={formatWeight(c.charged_weight_kg)} />
              <Detail label="Declared value" value={rupees(c.declared_value)} />
              <Detail label="E-way bill" value={c.ewb_no ?? "—"} mono />
              <Detail label="EWB valid till" value={formatDateTime(c.ewb_valid_until)} />
              <Detail label="Vehicle" value={vehicle?.reg_number ?? "Not assigned"} mono />
            </dl>
          </section>

          {/* Timeline */}
          <section className="rounded-[10px] border bg-white p-5">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wide text-ink-3">Timeline</h2>
            <Timeline
              events={(events ?? []).map((e) => ({
                at: e.event_time,
                status: e.to_status,
                milestone: e.milestone,
                kind: e.kind,
                place: e.location_name,
                reportedVia: (e.payload as { reported_via?: "phone" } | null)?.reported_via,
              }))}
            />
          </section>

          {/* POD */}
          <section className="rounded-[10px] border bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">
                Proof of delivery
              </h2>
              {["dispatched", "in_transit", "delivered"].includes(c.status) && (
                <OfficePodUpload id={c.id} nextPageNo={podUrls.length + 1} />
              )}
            </div>
            {podUrls.length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-3">
                Nothing uploaded yet. The driver can add it from their link, or the office can
                attach it above if it arrived some other way.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {podUrls.map((p) => (
                  <a key={p.id} href={p.url ?? "#"} target="_blank" rel="noreferrer" className="block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url ?? ""}
                      alt={`POD page ${p.page_no}`}
                      className="aspect-[4/3] w-full rounded-md border object-cover"
                    />
                    <p className="mt-1 text-xs text-ink-3">
                      Page {p.page_no} · {formatDateTime(p.uploaded_at)}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Commercials + settlement */}
        <aside className="space-y-4">
          <section className="rounded-[10px] border bg-white p-5">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-3">Commercials</h2>
            <dl className="space-y-1.5 text-sm">
              <Amount label="Freight" value={rupees(c.freight)} />
              {Number(c.loading) > 0 && <Amount label="Loading" value={rupees(c.loading)} />}
              {Number(c.unloading) > 0 && <Amount label="Unloading" value={rupees(c.unloading)} />}
              {Number(c.detention) > 0 && <Amount label="Detention" value={rupees(c.detention)} />}
              {Number(c.other_charges) > 0 && <Amount label="Other" value={rupees(c.other_charges)} />}
              <div className="border-t pt-1.5">
                <Amount label="Taxable value" value={rupees(c.taxable_value)} />
              </div>

              {snapshot.reason === "rcm" && (
                <p className="pt-2 text-xs leading-relaxed text-ink-3">{RCM_NOTE}</p>
              )}
              {snapshot.reason === "exempt" && (
                <p className="pt-2 text-xs text-ink-3">{EXEMPT_NOTE}</p>
              )}
              {snapshot.reason === "inter_state" && (
                <Amount label={`IGST @ ${c.tax_rate_pct}%`} value={rupees(c.igst_amount)} />
              )}
              {snapshot.reason === "intra_state" && (
                <>
                  <Amount label={`CGST @ ${Number(c.tax_rate_pct) / 2}%`} value={rupees(c.cgst_amount)} />
                  <Amount label={`SGST @ ${Number(c.tax_rate_pct) / 2}%`} value={rupees(c.sgst_amount)} />
                </>
              )}

              <div className="border-t pt-1.5 font-medium">
                <Amount label="Total" value={rupees(c.invoice_total)} />
              </div>
            </dl>
          </section>

          <section className="rounded-[10px] border bg-white p-5">
            <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-3">Settlement</h2>
            <dl className="space-y-1.5 text-sm">
              <Amount label="Advance to driver" value={rupees(settlement.officeAdvance)} />
              <Amount label="Driver paid" value={rupees(settlement.driverPaid)} />
              <div className="border-t pt-1.5 font-medium">
                <Amount
                  label={settlement.driverPaid - settlement.officeAdvance >= 0 ? "Office owes driver" : "Driver owes office"}
                  value={rupees(Math.abs(settlement.driverPaid - settlement.officeAdvance))}
                />
              </div>
            </dl>

            {(expenses ?? []).length > 0 && (
              <ul className="mt-3 space-y-1 border-t pt-3 text-xs text-ink-2">
                {(expenses ?? []).map((e) => (
                  <li key={e.id} className="flex justify-between">
                    <span className="capitalize">
                      {e.kind}
                      {e.litres ? ` · ${e.litres} L` : ""}
                      <span className="text-ink-3"> ({e.paid_by})</span>
                    </span>
                    <span className="tabular">{rupees(e.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {vendorParty && (
            <VendorChargePanel
              consignmentId={c.id}
              vendor={vendorParty}
              entries={(vendorEntries ?? []) as VendorLedgerEntry[]}
              canWrite={["owner", "accounts"].includes(auth.ctx.role)}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={`mt-0.5 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

function Amount({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-2">{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
