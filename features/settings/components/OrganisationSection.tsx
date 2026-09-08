"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordSheet, type FieldDef } from "@/features/masters/components/RecordSheet";
import { GST_STATE_OPTIONS } from "@/lib/india/states";

interface Organisation {
  legal_name: string;
  gstin: string | null;
  transin: string | null;
  pan: string | null;
  state_code: string;
  address: string | null;
}

const FIELDS: FieldDef[] = [
  { name: "legal_name", label: "Legal name", required: true },
  { name: "gstin", label: "GSTIN", hint: "Leave blank if you use a TRANSIN instead.", half: true },
  { name: "transin", label: "Transporter ID (TRANSIN)", half: true },
  { name: "pan", label: "PAN", half: true },
  {
    name: "state_code", label: "State", kind: "combobox", half: true, required: true,
    options: GST_STATE_OPTIONS.map((s) => ({ value: s.code, label: s.name })),
  },
  { name: "address", label: "Address" },
];

/**
 * The identity fields printed at the top of every LR. Editable by the owner
 * only — reusing RecordSheet rather than a bespoke form, since this is
 * exactly the shape it was built for: one endpoint, one PATCH, server-side
 * field errors highlighted in place.
 */
export function OrganisationSection({ org, canEdit }: { org: Organisation; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);

  return (
    <section className="rounded-[10px] border bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-wide text-ink-3 uppercase">Organisation</h2>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" strokeWidth={1.5} />
            Edit
          </Button>
        )}
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <Row label="Legal name" value={org.legal_name} />
        <Row label="GSTIN" value={org.gstin ?? org.transin} mono />
        <Row label="PAN" value={org.pan} mono />
        <Row label="State code" value={org.state_code} />
        <div className="sm:col-span-2">
          <Row label="Address" value={org.address} />
        </div>
      </dl>

      <RecordSheet
        open={editing}
        onOpenChange={setEditing}
        title="Edit organisation"
        description="Printed at the top of every lorry receipt and invoice."
        endpoint="/api/organisations"
        method="PATCH"
        fields={FIELDS}
        initial={{ ...org }}
      />
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={`mt-0.5 ${mono ? "font-mono" : ""}`}>{value || "—"}</dd>
    </div>
  );
}
