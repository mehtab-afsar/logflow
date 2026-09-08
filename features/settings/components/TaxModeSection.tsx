"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RCM_NOTE, type TaxMode } from "@/lib/tax";

const TAX_MODE_COPY: Record<TaxMode, { title: string; body: string }> = {
  rcm: {
    title: "Reverse charge (RCM)",
    body: `You do not charge GST on the lorry receipt; the customer pays it directly. The LR prints: "${RCM_NOTE}"`,
  },
  fcm_5: {
    title: "Forward charge at 5%",
    body: "You charge 5% GST and cannot claim input tax credit. Split as CGST+SGST within your state, IGST outside it.",
  },
  fcm_18: {
    title: "Forward charge at 18%",
    body: "You charge 18% GST and can claim input tax credit. Split as CGST+SGST within your state, IGST outside it.",
  },
};

const MODES: TaxMode[] = ["rcm", "fcm_5", "fcm_18"];

/**
 * A select-and-save here would be one click away from changing every future
 * document's tax treatment. The dialog's own explicit confirm button is the
 * second click that a field this consequential deserves — the same caution
 * this page has always shown, just no longer read-only.
 *
 * No historical risk either way: tax_mode is copied onto each consignment at
 * creation and frozen there (see lib/tax.ts), so this can never rewrite a
 * document already issued.
 */
export function TaxModeSection({ mode, canEdit }: { mode: TaxMode; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<TaxMode>(mode);
  const [busy, setBusy] = useState(false);
  const current = TAX_MODE_COPY[mode];

  async function confirm() {
    setBusy(true);
    try {
      const res = await fetch("/api/organisations/tax-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tax_mode: pending }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Could not change the tax treatment");
        return;
      }
      toast.success("Tax treatment changed");
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-[10px] border bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-wide text-ink-3 uppercase">Tax treatment</h2>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setPending(mode);
              setOpen(true);
            }}
          >
            Change
          </Button>
        )}
      </div>
      <p className="mt-2 font-medium">{current.title}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink-2">{current.body}</p>
      <p className="mt-3 rounded-md bg-marigold-tint p-3 text-xs text-marigold-ink">
        This setting changes every lorry receipt and freight bill you issue. Confirm it with your
        chartered accountant before going live. Documents already issued keep the treatment they
        were created with.
      </p>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change tax treatment</DialogTitle>
            <DialogDescription>
              This applies to every LR and bill from now on. Nothing already issued changes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5">
            {MODES.map((m) => (
              <label
                key={m}
                className={`flex cursor-pointer gap-3 rounded-md border p-3 ${
                  pending === m ? "border-primary bg-accent" : "border-border"
                }`}
              >
                <input
                  type="radio"
                  name="pending-tax-mode"
                  checked={pending === m}
                  onChange={() => setPending(m)}
                  className="mt-1 size-4 shrink-0 accent-primary"
                />
                <span>
                  <span className="block text-sm font-medium">{TAX_MODE_COPY[m].title}</span>
                  <span className="mt-0.5 block text-xs text-ink-2">{TAX_MODE_COPY[m].body}</span>
                </span>
              </label>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirm} disabled={busy || pending === mode}>
              {busy ? "Changing…" : "Yes, change it"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
