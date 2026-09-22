"use client";

import { useState, useSyncExternalStore } from "react";
import { Loader2, MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** localhost, 127.0.0.1 and the IPv6 loopback — reachable only from this
 *  machine, never from the phone a link is actually sent to. */
function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return false;
  }
}

/**
 * WhatsApp deep links. The MVP deliberately does not use the WhatsApp Business
 * API: a wa.me link opens the dispatcher's own WhatsApp with the message
 * pre-composed, which needs no approval, no template review and no per-message
 * cost — and it is what the office already does by hand.
 *
 * The links are rewritten to the origin the dispatcher is actually browsing
 * from — a custom domain, a Vercel preview URL, whatever it really is —
 * rather than trusting NEXT_PUBLIC_APP_URL to already match it.
 *
 * ONE EXCEPTION, ENFORCED HERE RATHER THAN BY CONVENTION: if that browsing
 * origin is localhost/127.0.0.1, it is never used. A link to "localhost" sent
 * to a phone points the phone at itself, not at this machine — and the
 * previous version of this fix relied on the dispatcher remembering to open
 * the app via its LAN address instead of localhost before clicking send,
 * which is exactly the kind of thing that gets forgotten under load. So the
 * check lives in code: a localhost origin is discarded and the server-built
 * URL (NEXT_PUBLIC_APP_URL — the LAN address in dev, the real domain in
 * production) is sent instead. That server URL is also never a bare
 * localhost in production, by the same env var's own contract.
 */
export function ShareButtons({
  consignmentId,
  lrNo,
  trackingUrl,
  driverPhone,
  driverUrl,
  consignorPhone,
  pdfUrl,
}: {
  consignmentId: string;
  lrNo: string;
  trackingUrl: string;
  driverPhone?: string | null;
  driverUrl?: string | null;
  consignorPhone?: string | null;
  pdfUrl: string;
}) {
  const [sendingLr, setSendingLr] = useState(false);
  // The server cannot know which host the browser used, so this is read from
  // the client. useSyncExternalStore rather than state-in-an-effect: the value
  // never changes for the life of the page, and the server snapshot of null
  // keeps hydration honest.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => null,
  );

  /**
   * Swap the server-rendered origin for the one actually in the address bar —
   * unless that address bar says localhost, in which case the swap is
   * skipped and the server's own URL (already built from
   * NEXT_PUBLIC_APP_URL) goes out untouched. A link handed to a driver or a
   * consignee must be reachable from a phone that is not this laptop.
   */
  const onThisHost = (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (!origin || isLocalOrigin(origin)) return url;
    try {
      const u = new URL(url);
      return `${origin}${u.pathname}${u.search}`;
    } catch {
      return url;
    }
  };

  const wa = (phone: string | null | undefined, text: string) => {
    const digits = (phone ?? "").replace(/\D/g, "").slice(-10);
    const base = digits ? `https://wa.me/91${digits}` : "https://wa.me/";
    return `${base}?text=${encodeURIComponent(text)}`;
  };

  /**
   * Unlike every other button here, this one cannot be a plain link built
   * from a prop: the LR PDF route requires a real session (correctly — it
   * re-renders through the caller's own RLS-scoped read), so a URL to it
   * would 401 the moment the consignor's phone opens it. This fetches a
   * signed, no-login-required link first — see lr-share-link/route.ts for
   * why that route exists instead of just widening what pdfUrl points to.
   */
  async function sendLrToConsignor() {
    setSendingLr(true);
    try {
      const res = await fetch(`/api/consignments/${consignmentId}/lr-share-link`);
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Could not create a shareable link");
        return;
      }
      const text = `LR ${lrNo} — please print all copies and hand them to the driver at pickup: ${json.data.url}`;
      window.open(wa(consignorPhone, text), "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not reach the server. Check your connection.");
    } finally {
      setSendingLr(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" asChild>
        <a href={pdfUrl} target="_blank" rel="noreferrer">
          <Printer className="size-4" strokeWidth={1.5} />
          Print LR
        </a>
      </Button>

      {driverUrl && (
        <Button
          variant="outline"
          asChild
          onClick={() => toast.success("Opening WhatsApp")}
        >
          <a
            href={wa(
              driverPhone,
              `Trip ${lrNo}. Open this link for pickup, drop and to upload the POD: ${onThisHost(driverUrl)}`,
            )}
            target="_blank"
            rel="noreferrer"
          >
            <MessageCircle className="size-4" strokeWidth={1.5} />
            Send to driver
          </a>
        </Button>
      )}

      <Button variant="outline" asChild>
        <a
          href={wa(consignorPhone, `Track your consignment ${lrNo}: ${onThisHost(trackingUrl)}`)}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle className="size-4" strokeWidth={1.5} />
          Send tracking
        </a>
      </Button>

      {/*
       * The paper problem, not the tracking problem: a driver with no
       * smartphone still needs a printed LR in his hand before he leaves, and
       * the office often isn't where the truck is (it may be picking up two
       * towns away). The consignor's own premises almost always has someone
       * who already prints their own delivery paperwork — this puts the PDF
       * in front of that person instead, so paper is ready before the truck
       * arrives to load, with no assumption the driver ever opens a link.
       */}
      <Button variant="outline" onClick={sendLrToConsignor} disabled={sendingLr}>
        {sendingLr ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={1.5} />
        ) : (
          <MessageCircle className="size-4" strokeWidth={1.5} />
        )}
        Send LR to consignor
      </Button>
    </div>
  );
}
