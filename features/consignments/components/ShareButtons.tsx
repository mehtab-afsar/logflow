"use client";

import { MessageCircle, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * WhatsApp deep links. The MVP deliberately does not use the WhatsApp Business
 * API: a wa.me link opens the dispatcher's own WhatsApp with the message
 * pre-composed, which needs no approval, no template review and no per-message
 * cost — and it is what the office already does by hand.
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
              `Trip ${lrNo}. Open this link for pickup, drop and to upload the POD: ${driverUrl}`,
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
          href={wa(consignorPhone, `Track your consignment ${lrNo}: ${trackingUrl}`)}
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
