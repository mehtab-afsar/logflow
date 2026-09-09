"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordSheet, type FieldDef } from "@/features/masters/components/RecordSheet";
import { GST_STATE_OPTIONS } from "@/lib/india/states";

interface BankDetails {
  bank?: string;
  branch?: string;
  account?: string;
  ifsc?: string;
}

interface Organisation {
  legal_name: string;
  gstin: string | null;
  transin: string | null;
  pan: string | null;
  state_code: string;
  address: string | null;
  risk_clause: string;
  bank_details: BankDetails | null;
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
  {
    name: "risk_clause", label: "Risk clause", required: true,
    placeholder: "At owner's risk", hint: "Printed at the bottom of every lorry receipt.",
  },
  { name: "bank_name", label: "Bank name", half: true },
  { name: "bank_branch", label: "Branch", half: true },
  { name: "bank_account", label: "Account number", half: true },
  { name: "bank_ifsc", label: "IFSC", half: true, placeholder: "HDFC0001234" },
];

/** bank_name/branch/account/ifsc are sent flat, straight through — no
 *  transform needed. The route assembles them into the one stored
 *  bank_details jsonb; see the schema comment in onboarding.ts for why they
 *  are not nested on the wire. This only flattens bank_details BACK into
 *  those same four fields, so opening the sheet shows what was saved. */
function toFormValues(org: Organisation): Record<string, unknown> {
  const b = org.bank_details ?? {};
  return {
    ...org,
    bank_name: b.bank ?? "", bank_branch: b.branch ?? "",
    bank_account: b.account ?? "", bank_ifsc: b.ifsc ?? "",
  };
}

/**
 * The identity fields printed at the top of every LR, plus the risk clause
 * and bank details printed at the bottom of the LR and on every invoice.
 * Onboarding collects all three; until this, only the identity fields could
 * be changed afterwards. Editable by the owner only — reusing RecordSheet
 * rather than a bespoke form, since this is exactly the shape it was built
 * for: one endpoint, one PATCH, server-side field errors highlighted in place.
 */
export function OrganisationSection({ org, canEdit }: { org: Organisation; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const bank = org.bank_details;
  const hasBankDetails = Boolean(bank?.account && bank?.ifsc);

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
        <div className="sm:col-span-2">
          <Row label="Risk clause" value={org.risk_clause} />
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-ink-3">Bank details</dt>
          <dd className="mt-0.5">
            {hasBankDetails
              ? `${bank?.bank ?? ""}${bank?.branch ? ` (${bank.branch})` : ""} · A/c ${bank?.account} · IFSC ${bank?.ifsc}`
              : <span className="text-ink-3">Not set — invoices print without a payment line</span>}
          </dd>
        </div>
      </dl>

      <RecordSheet
        open={editing}
        onOpenChange={setEditing}
        title="Edit organisation"
        description="Printed at the top and bottom of every lorry receipt and invoice."
        endpoint="/api/organisations"
        method="PATCH"
        fields={FIELDS}
        initial={toFormValues(org)}
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
