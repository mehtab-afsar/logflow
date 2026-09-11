"use client";

import { useMemo, useState } from "react";
import { MastersTable, type Column } from "./MastersTable";
import {
  PARTY_FIELDS, partyToApiShape, partyToFormValues, type PartyRow,
} from "../party-fields";
import { stateName } from "@/lib/india/states";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  consignor: "Consignor",
  consignee: "Consignee",
  both: "Either",
};

const FILTERS = [
  { value: "all", label: "All" },
  { value: "consignor", label: "Consignors" },
  { value: "consignee", label: "Consignees" },
  { value: "both", label: "Either" },
] as const;

/**
 * "Usually the: Consignor / Consignee / Either" was collected on every party
 * and used nowhere — no column showed it, and the LR form's two pickers both
 * listed every party regardless. A list of any real size was then a flat wall
 * of names with no way to tell them apart, which is what "too complicated to
 * select" turned out to mean once reproduced: not the form, the list after it.
 */
export function PartiesTable({ rows, canWrite, canDelete }: { rows: PartyRow[]; canWrite: boolean; canDelete: boolean }) {
  const [filter, setFilter] = useState<string>("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, consignor: 0, consignee: 0, both: 0 };
    for (const p of rows) c[p.party_role] = (c[p.party_role] ?? 0) + 1;
    return c;
  }, [rows]);

  const filtered = filter === "all" ? rows : rows.filter((p) => p.party_role === filter);

  const columns: Column<PartyRow>[] = [
    { header: "Name", render: (p) => <span className="font-medium">{p.name}</span> },
    {
      header: "Role",
      render: (p) => <Badge variant="outline">{ROLE_LABEL[p.party_role] ?? "Either"}</Badge>,
    },
    { header: "GSTIN", render: (p) => <span className="font-mono text-ink-2">{p.gstin ?? "—"}</span> },
    {
      header: "State",
      render: (p) => (
        <span className="text-ink-2">{stateName(p.state_code) ?? p.state_code ?? "—"}</span>
      ),
    },
    { header: "City", render: (p) => <span className="text-ink-2">{p.addresses?.[0]?.city ?? "—"}</span> },
    { header: "Mobile", render: (p) => <span className="font-mono text-ink-2">{p.phone ?? "—"}</span> },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by role">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150",
              filter === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-line text-ink-2 hover:border-ink-3",
            )}
          >
            {f.label} <span className="opacity-70">{counts[f.value] ?? 0}</span>
          </button>
        ))}
      </div>

      <MastersTable
        rows={filtered}
        columns={columns}
        fields={PARTY_FIELDS}
        resource="parties"
        singular="party"
        plural="parties"
        canWrite={canWrite}
        canDelete={canDelete}
        transform={partyToApiShape}
        toFormValues={partyToFormValues}
        emptyHint={
          filter === "all"
            ? "No parties yet. Add the consignors and consignees you dispatch for."
            : `No parties marked "${FILTERS.find((f) => f.value === filter)?.label}" yet.`
        }
      />
    </div>
  );
}
