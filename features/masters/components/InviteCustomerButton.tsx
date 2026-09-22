"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mail } from "lucide-react";

/**
 * Provisions the customer portal for one party — staff-initiated, never
 * self-signup (see app/api/parties/[id]/invite-customer). Inline rather than
 * a modal: this is a rare, one-off action per party, not worth a whole sheet.
 */
export function InviteCustomerButton({ partyId }: { partyId: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!email.includes("@")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/parties/${partyId}/invite-customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Could not send the invite");
        return;
      }
      toast.success(`Portal invite sent to ${email}`);
      setOpen(false);
      setEmail("");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Mail className="size-3.5" strokeWidth={1.5} />
        Invite to portal
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="email"
        placeholder="contact@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-8 w-44"
        autoFocus
      />
      <Button size="sm" className="h-8" disabled={busy || !email.includes("@")} onClick={send}>
        {busy ? "Sending…" : "Send"}
      </Button>
      <Button variant="ghost" size="sm" className="h-8" onClick={() => setOpen(false)}>
        Cancel
      </Button>
    </div>
  );
}
