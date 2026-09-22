"use client";

import { useMemo } from "react";
import { MastersTable, type Column } from "./MastersTable";
import type { FieldDef } from "./RecordSheet";
import { formatINR } from "@/lib/money";

export interface ContractRow {
  id: string;
  counterparty_type: "consignor" | "vendor";
  party_id: string;
  route_origin_city: string | null;
  route_destination_city: string | null;
  vehicle_type: string | null;
  freight_basis: "per_trip" | "per_ton";
  rate: number;
  valid_from: string;
  valid_to: string | null;
  notes: string | null;
}

const FREIGHT_BASIS_LABEL: Record<string, string> = { per_trip: "per trip", per_ton: "per ton" };

/**
 * Standing rates, not a live lookup shown here — the actual "did this apply"
 * decision happens once, silently, when a dispatcher accepts the suggested
 * rate into an LR's charge line (see LrForm.tsx's contract lookup).
 */
export function ContractsTable({
  rows, parties, canWrite, canDelete,
}: {
  rows: ContractRow[];
  parties: { id: string; name: string }[];
  canWrite: boolean;
  canDelete: boolean;
}) {
  const partyName = useMemo(() => {
    const m = new Map(parties.map((p) => [p.id, p.name]));
    return (id: string) => m.get(id) ?? "—";
  }, [parties]);

  const fields: FieldDef[] = [
    {
      name: "counterparty_type", label: "Counterparty", kind: "select", required: true, half: true,
      defaultValue: "consignor",
      options: [
        { value: "consignor", label: "Consignor — what we charge them" },
        { value: "vendor", label: "Vendor — what we pay them" },
      ],
    },
    {
      name: "party_id", label: "Party", kind: "combobox", required: true, half: true,
      options: parties.map((p) => ({ value: p.id, label: p.name })),
    },
    { name: "route_origin_city", label: "From city (optional)", half: true, hint: "Blank matches any route" },
    { name: "route_destination_city", label: "To city (optional)", half: true },
    { name: "vehicle_type", label: "Vehicle type (optional)", half: true, hint: "Blank matches any vehicle" },
    {
      name: "freight_basis", label: "Rate basis", kind: "select", half: true, defaultValue: "per_trip",
      options: [{ value: "per_trip", label: "Per trip" }, { value: "per_ton", label: "Per ton" }],
    },
    { name: "rate", label: "Rate (₹)", kind: "number", required: true, half: true },
    { name: "valid_from", label: "Valid from", kind: "date", required: true, half: true },
    { name: "valid_to", label: "Valid to (optional)", kind: "date", half: true, hint: "Blank = open-ended" },
    { name: "notes", label: "Notes" },
  ];

  const columns: Column<ContractRow>[] = [
    {
      header: "Counterparty",
      render: (c) => (
        <div>
          <span className="font-medium">{partyName(c.party_id)}</span>
          <span className="ml-1.5 text-xs text-ink-3 capitalize">({c.counterparty_type})</span>
        </div>
      ),
    },
    {
      header: "Route",
      render: (c) =>
        c.route_origin_city || c.route_destination_city
          ? <span className="text-ink-2">{c.route_origin_city ?? "Any"} → {c.route_destination_city ?? "Any"}</span>
          : <span className="text-ink-3">Any route</span>,
    },
    { header: "Vehicle", render: (c) => <span className="text-ink-2">{c.vehicle_type ?? "Any"}</span> },
    {
      header: "Rate",
      render: (c) => (
        <span className="tabular">{formatINR(Math.round(c.rate * 100))} {FREIGHT_BASIS_LABEL[c.freight_basis]}</span>
      ),
    },
    {
      header: "Valid",
      render: (c) => <span className="text-ink-2">{c.valid_from} → {c.valid_to ?? "open"}</span>,
    },
  ];

  return (
    <MastersTable
      rows={rows}
      columns={columns}
      fields={fields}
      resource="contracts"
      singular="contract"
      canWrite={canWrite}
      canDelete={canDelete}
      emptyHint="No standing rates yet. Add one to have it suggested on matching LRs."
    />
  );
}
