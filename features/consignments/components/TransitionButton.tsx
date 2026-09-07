"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  nextForwardStatus, TRANSITION_LABEL, type Status,
} from "@/lib/consignments/state-machine";

/**
 * Advances a consignment one step.
 *
 * The button only offers the next forward status; the server re-validates the
 * edge and its preconditions regardless, so this is convenience, never
 * security. A 409 carries the server's plain-language reason ("a vehicle and a
 * driver are required before dispatch") and we show it verbatim — it is
 * already written for the dispatcher.
 */
export function TransitionButton({
  id,
  status,
  advanceDefault,
}: {
  id: string;
  status: Status;
  advanceDefault?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next = nextForwardStatus(status);

  if (!next) return null;

  async function go() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { to_status: next };
      // Dispatch is where the office advance is recorded, so it rides along.
      if (next === "dispatched" && advanceDefault) body.advance = advanceDefault;
      if (next === "delivered") body.force = true;

      const res = await fetch(`/api/consignments/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error ?? "Could not update this consignment");
        return;
      }
      toast.success(`Marked ${TRANSITION_LABEL[next!].toLowerCase()}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={go} disabled={busy}>
      {busy ? "Working…" : TRANSITION_LABEL[next]}
    </Button>
  );
}
