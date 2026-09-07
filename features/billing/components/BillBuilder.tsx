"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/money";

export interface Billable {
  id: string;
  lr_no: string;
  branch_id: string;
  consignor_party_id: string;
  consignor_name: string;
  consignee_state: string;
  taxable_value: number;
}

/**
 * Bulk bill builder.
 *
 * Selection is constrained to one consignor and one destination state at a
 * time, because a single bill cannot mix intra- and inter-state supplies —
 * they carry different tax mechanisms. Rather than let the user select freely
 * and fail on submit, incompatible rows are disabled with the reason shown.
 */
export function BillBuilder({ rows }: { rows: Billable[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const anchor = useMemo(
    () => rows.find((r) => selected.has(r.id)) ?? null,
    [rows, selected],
  );

  const compatible = (r: Billable) =>
    !anchor ||
    (r.consignor_party_id === anchor.consignor_party_id &&
      r.branch_id === anchor.branch_id &&
      r.consignee_state === anchor.consignee_state);

  const total = rows
    .filter((r) => selected.has(r.id))
    .reduce((s, r) => s + r.taxable_value, 0);

  function toggle(r: Billable) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(r.id)) next.delete(r.id);
      else next.add(r.id);
      return next;
    });
  }

  async function submit() {
    if (!anchor) return;
    setBusy(true);
    try {
      const res = await fetch("/api/bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: anchor.branch_id,
          consignor_party_id: anchor.consignor_party_id,
          consignment_ids: [...selected],
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Could not raise the bill");
        return;
      }
      toast.success(`${json.data.bill_no} raised`);
      router.push("/bills");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const selectAllCompatible = () => {
    const first = rows[0];
    if (!first) return;
    setSelected(
      new Set(
        rows
          .filter(
            (r) =>
              r.consignor_party_id === first.consignor_party_id &&
              r.branch_id === first.branch_id &&
              r.consignee_state === first.consignee_state,
          )
          .map((r) => r.id),
      ),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={selectAllCompatible}>
          Select all for one consignor
        </Button>
        <Button variant="outline" onClick={() => setSelected(new Set())}>
          Clear
        </Button>
      </div>

      <div className="overflow-hidden rounded-[10px] border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2 font-medium">LR No.</th>
              <th className="px-3 py-2 font-medium">Consignor</th>
              <th className="px-3 py-2 font-medium">To state</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const ok = compatible(r);
              return (
                <tr key={r.id} className={`row-dense ${ok ? "" : "opacity-40"}`}>
                  <td className="px-3">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={selected.has(r.id)}
                      disabled={!ok}
                      onChange={() => toggle(r)}
                      title={ok ? undefined : "Different consignor, branch or destination state"}
                    />
                  </td>
                  <td className="px-3 font-mono">{r.lr_no}</td>
                  <td className="max-w-[240px] truncate px-3">{r.consignor_name}</td>
                  <td className="px-3 text-neutral-600">{r.consignee_state}</td>
                  <td className="px-3 text-right tabular">
                    {formatINR(Math.round(r.taxable_value * 100))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between rounded-[10px] border bg-white p-4">
        <div>
          <p className="text-sm text-neutral-500">{selected.size} selected</p>
          <p className="tabular text-xl font-semibold">{formatINR(Math.round(total * 100))}</p>
        </div>
        <Button disabled={selected.size === 0 || busy} onClick={submit}>
          {busy ? "Raising…" : "Raise bill"}
        </Button>
      </div>
    </div>
  );
}
