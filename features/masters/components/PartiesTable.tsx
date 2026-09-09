"use client";

import { MastersTable, type Column } from "./MastersTable";
import {
  PARTY_FIELDS, partyToApiShape, partyToFormValues, type PartyRow,
} from "../party-fields";
import { stateName } from "@/lib/india/states";

export function PartiesTable({ rows, canWrite, canDelete }: { rows: PartyRow[]; canWrite: boolean; canDelete: boolean }) {
  const columns: Column<PartyRow>[] = [
    { header: "Name", render: (p) => <span className="font-medium">{p.name}</span> },
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
    <MastersTable
      rows={rows}
      columns={columns}
      fields={PARTY_FIELDS}
      resource="parties"
      singular="party"
      canWrite={canWrite}
      canDelete={canDelete}
      transform={partyToApiShape}
      toFormValues={partyToFormValues}
      emptyHint="No parties yet. Add the consignors and consignees you dispatch for."
    />
  );
}
