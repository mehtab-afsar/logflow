"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Status } from "@/lib/consignments/state-machine";

/**
 * A distinct action from the main "Mark delivered" button, for the case this
 * whole feature exists for: the driver phoned in that he unloaded, but there
 * is no smartphone to record it and no signed paper in hand yet.
 *
 * "Mark delivered" already reaches this exact status with a bare force:true
 * click — that has been true since before this file existed — but it leaves
 * no record of *why* there is no POD, which conflates "actually delivered"
 * with "physical proof received". This is the honest version: same status,
 * an explicit annotation on the event instead of silence.
 */
export function PhoneInDeliveryButton({ id, status }: { id: string; status: Status }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (status !== "in_transit") return null;

  async function go() {
    setBusy(true);
    try {
      const res = await fetch(`/api/consignments/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to_status: "delivered", force: true, reported_via: "phone", pod_pending: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Could not update this consignment");
        return;
      }
      toast.success("Marked delivered — phoned in, POD pending");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" onClick={go} disabled={busy}>
      <Phone className="size-4" strokeWidth={1.5} />
      {busy ? "Working…" : "Delivered — phoned in"}
    </Button>
  );
}
