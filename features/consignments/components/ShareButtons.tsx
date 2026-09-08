"use client";

import { useSyncExternalStore } from "react";
import { MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * WhatsApp deep links. The MVP deliberately does not use the WhatsApp Business
 * API: a wa.me link opens the dispatcher's own WhatsApp with the message
 * pre-composed, which needs no approval, no template review and no per-message
 * cost — and it is what the office already does by hand.
 *
 * The links are rewritten to the origin the dispatcher is actually browsing
 * from. The server builds them from NEXT_PUBLIC_APP_URL, which in local
 * development is http://localhost:3000 — and a link to "localhost" sent to a
 * phone points the phone at itself. Worse, Chrome treats localhost specially
 * and forces https, so the driver sees ERR_SSL_PROTOCOL_ERROR rather than a
 * useful failure. Using the real origin means the link works whether the
 * office is on localhost, a LAN address, or a deployed domain.
 */
export function ShareButtons({
  lrNo,
  trackingUrl,
  driverPhone,
  driverUrl,
  consignorPhone,
  pdfUrl,
}: {
  lrNo: string;
  trackingUrl: string;
  driverPhone?: string | null;
  driverUrl?: string | null;
  consignorPhone?: string | null;
  pdfUrl: string;
}) {
  // The server cannot know which host the browser used, so this is read from
  // the client. useSyncExternalStore rather than state-in-an-effect: the value
  // never changes for the life of the page, and the server snapshot of null
  // keeps hydration honest.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => null,
  );

  /** Swap the server-rendered origin for the one actually in the address bar. */
  const onThisHost = (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (!origin) return url;
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
    </div>
  );
}
