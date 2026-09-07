"use client";

import { MastersTable, type Column } from "./MastersTable";
import type { FieldDef } from "./RecordSheet";
import { stateName, GST_STATE_OPTIONS } from "@/lib/india/states";

interface Address {
  label?: string; line1?: string; city?: string; state_code?: string; pincode?: string;
}
interface Party {
  id: string; name: string; gstin: string | null; state_code: string | null;
  phone: string | null; email: string | null; addresses: Address[] | null; party_role: string;
}

/**
 * The address is not optional in practice.
 *
 * A lorry receipt freezes the consignor's and consignee's address onto itself,
 * and the LR form falls back to the party's city for the route. A party saved
 * without one produces an LR that cannot be created — so the city and state are
 * collected here, and the four fields are folded into the single stored address.
 */
const PARTY_FIELDS: FieldDef[] = [
  { name: "name", label: "Party name", required: true },
  { name: "gstin", label: "GSTIN", half: true, placeholder: "29AABCS1429B1ZX", hint: "Checked including the check digit" },
  {
    name: "party_role", label: "Usually the", kind: "select", half: true, defaultValue: "both",
    options: [
      { value: "both", label: "Either" },
      { value: "consignor", label: "Consignor" },
      { value: "consignee", label: "Consignee" },
    ],
  },
  { name: "line1", label: "Address", required: true, placeholder: "Plot 47, Peenya Industrial Area" },
  { name: "city", label: "City", required: true, half: true, placeholder: "Bengaluru" },
  {
    name: "state_code", label: "State", kind: "select", half: true,
    hint: "Filled from the GSTIN when you enter one",
    options: GST_STATE_OPTIONS.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` })),
  },
  { name: "pincode", label: "Pincode", half: true, placeholder: "560058" },
  { name: "phone", label: "Mobile", kind: "tel", half: true, placeholder: "9876543210" },
  { name: "email", label: "Email", half: true },
];

/** Four flat fields on screen → the one stored address the LR snapshot needs. */
function toApiShape(flat: Record<string, unknown>): Record<string, unknown> {
  const { line1, city, state_code, pincode, ...rest } = flat as Record<string, string>;
  return {
    ...rest,
    state_code: state_code || null,
    addresses: line1 || city
      ? [{ label: "Office", line1: line1 ?? "", city: city ?? "", state_code: state_code || "29", pincode: pincode || null }]
      : [],
  };
}

/** …and back again, so editing shows what was saved. */
function toFormValues(p: Party): Record<string, unknown> {
  const a = p.addresses?.[0] ?? {};
  return {
    ...p,
    line1: a.line1 ?? "",
    city: a.city ?? "",
    state_code: p.state_code ?? a.state_code ?? "",
    pincode: a.pincode ?? "",
  };
}

export function PartiesTable({ rows, canWrite, canDelete }: { rows: Party[]; canWrite: boolean; canDelete: boolean }) {
  const columns: Column<Party>[] = [
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
      transform={toApiShape}
      toFormValues={toFormValues}
      emptyHint="No parties yet. Add the consignors and consignees you dispatch for."
    />
  );
}
