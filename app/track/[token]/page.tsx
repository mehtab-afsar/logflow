import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Timeline, type TrackEvent } from "@/features/tracking/components/Timeline";
import { STATUS_TOKENS } from "@/lib/design/tokens";
import { formatDate } from "@/lib/india/format";
import type { Status } from "@/lib/consignments/state-machine";

/**
 * Public consignment tracking.
 *
 * CONSTRAINTS THAT SHAPE THIS FILE — the customer opens it from a WhatsApp
 * message, on a phone, on 3G, sometimes with JavaScript disabled:
 *
 *   · No 'use client' anywhere in this tree, and no <Suspense> — out-of-order
 *     streaming reveals content with inline scripts, which never run.
 *   · No next/image: its lazy-loading path needs JavaScript. Plain <img>.
 *   · revalidate = 30 rather than force-dynamic. Thirty seconds of HTML
 *     caching is the difference between ~1.4s and ~300ms on 3G, and the
 *     10-minute signed POD URL comfortably outlives it.
 *
 * The data comes from a security-definer RPC returning a whitelisted
 * projection — freight, advances, GSTINs and phone numbers are not merely
 * hidden here, they are never sent to this process.
 */
export const revalidate = 30;

export const metadata: Metadata = {
  title: "Track consignment",
  // Its own description, so the product marketing copy in the root layout does
  // not ride along on a page shown to someone else's customer.
  description: "Live status of your consignment.",
  robots: { index: false, follow: false },
};

interface TrackData {
  lr_no: string;
  lr_date: string;
  status: Status;
  from_city: string;
  to_city: string;
  vehicle_no: string | null;
  driver_first_name: string | null;
  eta_text: string | null;
  pod_path: string | null;
  events: TrackEvent[];
}

export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; // Next 16: params is a Promise

  // Deliberately the ANON path: an unauthenticated visitor has no session, so
  // this exercises exactly the grant a real customer uses. If the projection
  // were ever widened, this page would leak precisely what anon can reach —
  // nothing more.
  const supabase = await createClient();
  const { data } = await supabase.rpc("track_consignment", { p_token: token });
  const trip = data as TrackData | null;

  if (!trip) notFound();

  // Signed server-side; the URL outlives the 30s page cache.
  // Signing needs the service role; authorisation already happened above via
  // the token itself.
  const admin = createAdminClient();
  let podUrl: string | null = null;
  if (trip.pod_path) {
    const { data: signed } = await admin.storage
      .from("pods")
      .createSignedUrl(trip.pod_path, 600);
    podUrl = signed?.signedUrl ?? null;
  }

  const token_ = STATUS_TOKENS[trip.status];

  return (
    <main className="mx-auto min-h-dvh w-full max-w-[560px] bg-white px-5 py-8">
      <header className="mb-6 flex items-center gap-2 text-ink-3">
        <Truck className="size-4" strokeWidth={1.5} />
        <span className="text-sm">LogiFlow</span>
      </header>

      <p className="font-mono text-sm text-ink-3">{trip.lr_no}</p>
      <h1 className="mt-1 text-2xl font-semibold leading-tight">
        {trip.from_city} → {trip.to_city}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${token_.className}`}>
          {token_.label}
        </span>
        <span className="text-sm text-ink-3">{formatDate(trip.lr_date)}</span>
      </div>

      {trip.eta_text && (
        <p className="mt-4 rounded-[10px] bg-paper p-3 text-sm">{trip.eta_text}</p>
      )}

      <dl className="mt-6 grid grid-cols-2 gap-4 border-y py-4 text-sm">
        <div>
          <dt className="text-ink-3">Vehicle</dt>
          <dd className="mt-0.5 font-mono">{trip.vehicle_no ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Driver</dt>
          <dd className="mt-0.5">{trip.driver_first_name ?? "—"}</dd>
        </div>
      </dl>

      <section className="mt-6">
        <h2 className="mb-4 text-sm font-medium text-ink-3">Progress</h2>
        <Timeline events={trip.events ?? []} />
      </section>

      {podUrl && (
        <section className="mt-2 rounded-[10px] border p-4">
          <h2 className="mb-3 text-sm font-medium">Proof of delivery</h2>
          {/* Plain <img> on purpose: next/image's lazy-loading path requires
              JavaScript, and this page must render in WhatsApp's in-app
              browser with scripting disabled. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={podUrl}
            alt="Signed proof of delivery"
            width={480}
            height={320}
            className="w-full rounded-md border object-cover"
          />
          <a
            href={podUrl}
            className="mt-3 inline-block text-sm text-primary underline"
            target="_blank"
            rel="noreferrer"
          >
            Download
          </a>
        </section>
      )}

      <footer className="mt-10 border-t pt-4 text-xs text-ink-3">
        For questions about this consignment, contact your transporter.
      </footer>
    </main>
  );
}
