"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

export interface LedgerEntry {
  id: string;
  entry_type: "charge" | "payment";
  amount: number;
  payment_mode: string | null;
  entered_at: string;
}

export interface LedgerRow {
  partyId: string;
  name: string;
  counterpartyType: "consignor" | "vendor";
  /** > 0 they owe us (consignor) or we owe them (vendor); < 0 overpaid. */
  outstanding: number;
  entries: LedgerEntry[];
}

const rupees = (n: number) => formatINR(Math.round(n * 100));

const PAYMENT_MODES = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "upi", label: "UPI" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
] as const;

export function LedgerTable({ rows, canWrite }: { rows: LedgerRow[]; canWrite: boolean }) {
  const [open, setOpen] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-[10px] border bg-white px-3 py-16 text-center">
        <p className="text-ink-3">Nothing outstanding — every party is settled.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[10px] border bg-white">
      <table className="w-full text-sm">
        <thead className="border-b bg-paper text-left text-xs text-ink-3">
          <tr>
            <th className="w-8 px-3 py-2" />
            <th className="px-3 py-2 font-medium">Party</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 text-right font-medium">Outstanding</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <LedgerRowView
              key={row.partyId}
              row={row}
              expanded={open === row.partyId}
              onToggle={() => setOpen(open === row.partyId ? null : row.partyId)}
              canWrite={canWrite}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LedgerRowView({
  row, expanded, onToggle, canWrite,
}: {
  row: LedgerRow; expanded: boolean; onToggle: () => void; canWrite: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const owedToUs = row.counterpartyType === "consignor";

  async function recordPayment() {
    const value = Number(amount);
    if (!value || value <= 0 || !mode) return;
    setBusy(true);
    try {
      const res = await fetch("/api/ledger/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          counterparty_type: row.counterpartyType,
          party_id: row.partyId,
          ref_type: "adjustment",
          amount: value,
          payment_mode: mode,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not save");
      toast.success("Payment recorded");
      setAmount("");
      setMode("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record this payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr className="row-dense cursor-pointer hover:bg-paper" onClick={onToggle}>
        <td className="px-3 text-ink-3">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </td>
        <td className="px-3 font-medium">{row.name}</td>
        <td className="px-3">
          <Badge variant="outline">{owedToUs ? "Consignor" : "Vendor"}</Badge>
        </td>
        <td
          className={cn(
            "px-3 text-right tabular font-medium",
            row.outstanding < 0 && "text-ink-3",
          )}
        >
          {rupees(Math.abs(row.outstanding))}
          <span className="ml-1.5 text-xs font-normal text-ink-3">
            {row.outstanding < 0 ? "overpaid" : owedToUs ? "owed to us" : "we owe"}
          </span>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={4} className="bg-paper px-3 py-3">
            {row.entries.length > 0 && (
              <ul className="mb-3 space-y-1 text-xs text-ink-2">
                {row.entries.map((e) => (
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

            {canWrite && (
              <div className="flex gap-2">
                <Input
                  type="number" inputMode="decimal" placeholder="Amount"
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-9 max-w-40 bg-white"
                />
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger className="h-9 w-36 bg-white" onClick={(e) => e.stopPropagation()}>
                    <SelectValue placeholder="Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); recordPayment(); }}
                  disabled={busy || !amount || !mode}
                >
                  {busy ? "Saving…" : owedToUs ? "Record receipt" : "Record payment"}
                </Button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
