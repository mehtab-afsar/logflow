"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { nextMilestone, MILESTONE_LABEL, type Status } from "@/lib/consignments/state-machine";

/**
 * The other end of "the driver called and said he's loaded/departed/
 * reached/unloaded" — recorded correctly attributed to the office, not
 * misattributed as if the driver had tapped it himself in the portal he
 * cannot use.
 *
 * Offers exactly one milestone, same as the driver portal's own button:
 * whichever one hasn't happened yet.
 */
export function RecordMilestoneButton({
  id, status, milestonesDone,
}: { id: string; status: Status; milestonesDone: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const next = nextMilestone(milestonesDone);

  // Milestones only mean anything once a truck and driver exist to report
  // them — nextMilestone([]) would otherwise happily offer "Loaded" on a
  // consignment that hasn't even been dispatched yet.
  if (!next || (status !== "dispatched" && status !== "in_transit")) return null;

  async function go() {
    setBusy(true);
    try {
      const res = await fetch(`/api/consignments/${id}/milestone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Could not record this");
        return;
      }
      toast.success(`Recorded ${MILESTONE_LABEL[next!].toLowerCase()} — phoned in`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={go} disabled={busy}>
      <Phone className="size-3.5" strokeWidth={1.5} />
      {busy ? "Working…" : `Phoned in: ${MILESTONE_LABEL[next]}`}
    </Button>
  );
}
