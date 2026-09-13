"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Printer, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Branch { id: string; name: string }
interface Reservation {
  id: string; branch_id: string; lr_no: string; reserved_date: string;
  batch_id: string; status: string; void_reason: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  reserved: "Reserved",
  claimed: "Being filled in",
  void: "Void",
};

export function BlankFormsPanel({
  branches, reservations, canWrite,
}: { branches: Branch[]; reservations: Reservation[]; canWrite: boolean }) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [count, setCount] = useState("10");
  const [busy, setBusy] = useState(false);
  const branchFieldId = useId();
  const countFieldId = useId();

  async function reserve() {
    const n = Number(count);
    if (!branchId) {
      toast.error("Choose a branch first");
      return;
    }
    if (!Number.isInteger(n) || n < 1 || n > 50) {
      toast.error("Reserve between 1 and 50 forms at a time");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/lr-reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch_id: branchId, count: n }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Could not reserve those numbers");
        return;
      }
      toast.success(`Reserved ${n} forms — ${json.data.reservations[0].lr_no} to ${json.data.reservations.at(-1).lr_no}`);
      router.refresh();
      window.open(`/api/lr-reservations/batch/${json.data.batch_id}/pdf`, "_blank");
    } finally {
      setBusy(false);
    }
  }

  async function voidOne(id: string, lrNo: string) {
    const reason = window.prompt(`Void ${lrNo}. Why? (e.g. "form torn", "printer jammed")`);
    if (reason === null) return; // cancelled
    if (!reason.trim()) {
      toast.error("A reason is required to void a reserved LR number");
      return;
    }
    const res = await fetch(`/api/lr-reservations/${id}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error ?? "Could not void this form");
      return;
    }
    toast.success(`${lrNo} voided — the number is permanently retired`);
    router.refresh();
  }

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? "—";

  return (
    <div className="space-y-5">
      {canWrite && (
        <div className="flex flex-wrap items-end gap-3 rounded-[10px] border bg-white p-4">
          <div className="space-y-1.5">
            <Label htmlFor={branchFieldId} className="text-xs text-ink-2">Branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger id={branchFieldId} className="w-48"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={countFieldId} className="text-xs text-ink-2">How many</Label>
            <Input
              id={countFieldId}
              type="number" min={1} max={50} value={count}
              onChange={(e) => setCount(e.target.value)}
              className="w-24"
            />
          </div>
          <Button onClick={reserve} disabled={busy}>
            <Printer className="size-4" strokeWidth={1.5} />
            {busy ? "Reserving…" : "Reserve and print"}
          </Button>
          <p className="w-full text-xs text-ink-3">
            Prints a blank, pre-numbered form for each — same layout as a real LR, nothing filled
            in but the number, date and branch. Hand them out like a checkbook.
          </p>
        </div>
      )}

      <div className="overflow-x-auto rounded-[10px] border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-paper text-left text-xs text-ink-3">
            <tr>
              <th className="px-3 py-2 font-medium">LR No.</th>
              <th className="px-3 py-2 font-medium">Branch</th>
              <th className="px-3 py-2 font-medium">Reserved</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="w-56 px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {reservations.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-16 text-center text-ink-3">
                  No blank forms reserved yet.
                </td>
              </tr>
            )}
            {reservations.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-mono font-medium">{r.lr_no}</td>
                <td className="px-3 py-2 text-ink-2">{branchName(r.branch_id)}</td>
                <td className="px-3 py-2 text-ink-2">{r.reserved_date}</td>
                <td className="px-3 py-2">
                  <Badge variant={r.status === "void" ? "outline" : "secondary"}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                  {r.status === "void" && r.void_reason && (
                    <span className="ml-2 text-xs text-ink-3">{r.void_reason}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {canWrite && r.status !== "void" && (
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/consignments/new?reservation_id=${r.id}`}>
                          <FileCheck className="size-3.5" strokeWidth={1.5} />
                          Reconcile
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => voidOne(r.id, r.lr_no)}>
                        Void
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
