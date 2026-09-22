"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatINR } from "@/lib/money";

export interface VendorLedgerEntry {
  id: string;
  entry_type: "charge" | "payment";
  amount: number;
  payment_mode: string | null;
  entered_at: string;
}

const rupees = (n: number) => formatINR(Math.round(n * 100));

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
] as const;

/**
 * What we owe the vendor who owns this trip's attached vehicle — record what
 * their own invoice says, then record what was paid against it. The amount is
 * always typed, never computed: a vendor's charge is whatever their invoice
 * says, not a formula (record_vendor_charge doesn't take a rate either).
 *
 * Only rendered when the trip's vehicle is attached and has an owner — a
 * vendor-less trip (own fleet) has nothing to show here.
 */
export function VendorChargePanel({
  consignmentId,
  vendor,
  entries,
  canWrite,
}: {
  consignmentId: string;
  vendor: { id: string; name: string };
  entries: VendorLedgerEntry[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeNotes, setChargeNotes] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMode, setPayMode] = useState<string>("");
  const [busy, setBusy] = useState<"charge" | "payment" | null>(null);

  const charged = entries.filter((e) => e.entry_type === "charge").reduce((s, e) => s + Number(e.amount), 0);
  const paid = entries.filter((e) => e.entry_type === "payment").reduce((s, e) => s + Number(e.amount), 0);
  const outstanding = charged - paid;

  async function post(url: string, body: Record<string, unknown>) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Could not save");
  }

  async function recordCharge() {
    const amount = Number(chargeAmount);
    if (!amount || amount <= 0) return;
    setBusy("charge");
    try {
      await post("/api/ledger/vendor-charges", {
        vendor_party_id: vendor.id,
        consignment_id: consignmentId,
        amount,
        notes: chargeNotes || undefined,
      });
      toast.success("Vendor charge recorded");
      setChargeAmount("");
      setChargeNotes("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record this charge");
    } finally {
      setBusy(null);
    }
  }

  async function recordPayment() {
    const amount = Number(payAmount);
    if (!amount || amount <= 0 || !payMode) return;
    setBusy("payment");
    try {
      await post("/api/ledger/payments", {
        counterparty_type: "vendor",
        party_id: vendor.id,
        ref_type: "trip",
        ref_id: consignmentId,
        amount,
        payment_mode: payMode,
      });
      toast.success("Payment recorded");
      setPayAmount("");
      setPayMode("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record this payment");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-[10px] border bg-white p-5">
      <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-3">
        Vendor — {vendor.name}
      </h2>

      {entries.length > 0 && (
        <ul className="mb-3 space-y-1 text-xs text-ink-2">
          {entries.map((e) => (
            <li key={e.id} className="flex justify-between">
              <span className="capitalize">
                {e.entry_type}
                {e.payment_mode ? ` · ${e.payment_mode.replace("_", " ")}` : ""}
              </span>
              <span className="tabular">{rupees(Number(e.amount))}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-between border-t pt-1.5 text-sm font-medium">
        <span>{outstanding >= 0 ? "Owed to vendor" : "Overpaid"}</span>
        <span className="tabular">{rupees(Math.abs(outstanding))}</span>
      </div>

      {canWrite && (
        <div className="mt-4 space-y-3 border-t pt-3">
          <div className="flex gap-2">
            <Input
              type="number" inputMode="decimal" placeholder="Charge amount"
              value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)}
              className="h-9"
            />
            <Button size="sm" onClick={recordCharge} disabled={busy === "charge" || !chargeAmount}>
              {busy === "charge" ? "Saving…" : "Add charge"}
            </Button>
          </div>
          <Input
            placeholder="Vendor's invoice / bilty no. (optional)"
            value={chargeNotes} onChange={(e) => setChargeNotes(e.target.value)}
            className="h-9 text-xs"
          />

          {outstanding > 0 && (
            <div className="flex gap-2">
              <Input
                type="number" inputMode="decimal" placeholder="Payment amount"
                value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                className="h-9"
              />
              <Select value={payMode} onValueChange={setPayMode}>
                <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Mode" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm" variant="outline" onClick={recordPayment}
                disabled={busy === "payment" || !payAmount || !payMode}
              >
                {busy === "payment" ? "Saving…" : "Pay"}
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
