"use client";

import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordSheet, type FieldDef } from "@/features/masters/components/RecordSheet";
import { GST_STATE_OPTIONS } from "@/lib/india/states";

export interface BranchRow {
  id: string;
  name: string;
  city: string | null;
  state_code: string | null;
  lr_prefix: string;
  inv_prefix: string;
  is_active: boolean;
  /** From branch_has_issued_documents() — see app/(app)/settings/page.tsx.
   *  Read through a SECURITY DEFINER RPC because document_sequences itself
   *  is deny-all under RLS; a plain join here would silently read as false
   *  regardless of the truth. */
  locked: boolean;
}

const ADD_FIELDS: FieldDef[] = [
  { name: "name", label: "Branch name", required: true },
  { name: "city", label: "City", half: true },
  {
    name: "state_code", label: "State", kind: "combobox", half: true,
    options: GST_STATE_OPTIONS.map((s) => ({ value: s.code, label: s.name })),
  },
  { name: "lr_prefix", label: "LR prefix", half: true, required: true, hint: "2–6 letters, e.g. LF" },
  { name: "inv_prefix", label: "Invoice prefix", half: true, required: true, hint: "2–6 letters, e.g. INV" },
  {
    name: "lr_starting_number", label: "Start LR numbers from", kind: "number", half: true,
    defaultValue: "0", hint: "Already issuing on paper? Enter the next number.",
  },
  {
    name: "inv_starting_number", label: "Start invoice numbers from", kind: "number", half: true,
    defaultValue: "0",
  },
];

const ACTIVE_OPTIONS = [
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive — hidden when creating a new LR" },
];

const EDIT_FIELDS_UNLOCKED: FieldDef[] = [
  { name: "name", label: "Branch name", required: true },
  { name: "city", label: "City", half: true },
  { name: "is_active", label: "Status", kind: "select", half: true, options: ACTIVE_OPTIONS },
  { name: "lr_prefix", label: "LR prefix", half: true, required: true },
  { name: "inv_prefix", label: "Invoice prefix", half: true, required: true },
];

const EDIT_FIELDS_LOCKED: FieldDef[] = [
  { name: "name", label: "Branch name", required: true },
  { name: "city", label: "City", half: true },
  { name: "is_active", label: "Status", kind: "select", half: true, options: ACTIVE_OPTIONS },
];

function boolFields(flat: Record<string, unknown>) {
  return { ...flat, is_active: flat.is_active === undefined ? undefined : flat.is_active === "true" };
}

export function BranchesSection({ branches, canEdit }: { branches: BranchRow[]; canEdit: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BranchRow | null>(null);

  return (
    <section className="rounded-[10px] border bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-wide text-ink-3 uppercase">Branches</h2>
        {canEdit && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" strokeWidth={1.5} />
            Add branch
          </Button>
        )}
      </div>

      <ul className="mt-3 divide-y text-sm">
        {branches.map((b) => (
          <li key={b.id} className="flex items-center justify-between py-2">
            <span>
              {b.name}
              {b.city ? ` · ${b.city}` : ""}
              {!b.is_active && <span className="ml-2 text-xs text-ink-3">(inactive)</span>}
            </span>
            <span className="flex items-center gap-3">
              <span className="font-mono text-xs text-ink-3">
                {b.lr_prefix}-… / {b.inv_prefix}-…
              </span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setEditing(b)}
                  aria-label={`Edit ${b.name}`}
                  className="text-ink-3 hover:text-ink"
                >
                  <Pencil className="size-3.5" strokeWidth={1.5} />
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>

      <RecordSheet
        open={adding}
        onOpenChange={setAdding}
        title="Add branch"
        description="Its own LR and invoice number series, from wherever you tell it to start."
        endpoint="/api/organisations/branches"
        method="POST"
        fields={ADD_FIELDS}
      />

      {editing && (
        <RecordSheet
          open={Boolean(editing)}
          onOpenChange={(v) => !v && setEditing(null)}
          title={`Edit ${editing.name}`}
          description={
            editing.locked
              ? "This branch has already issued a document, so its LR and invoice prefixes can no longer change."
              : "Name, city and — until the first document goes out — its prefixes."
          }
          endpoint={`/api/organisations/branches/${editing.id}`}
          method="PATCH"
          fields={editing.locked ? EDIT_FIELDS_LOCKED : EDIT_FIELDS_UNLOCKED}
          initial={{ ...editing }}
          transform={boolFields}
        />
      )}
    </section>
  );
}
