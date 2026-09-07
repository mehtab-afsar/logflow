"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RecordSheet, type FieldDef } from "./RecordSheet";

export interface Column<T> {
  header: string;
  render: (row: T) => React.ReactNode;
  align?: "right";
}

/**
 * A master list with add, edit and remove.
 *
 * Remove is a soft delete and is owner-only; the button is simply absent for
 * other roles rather than shown and then refused, because an action you cannot
 * take should not be offered.
 */
export function MastersTable<T extends { id: string }>({
  rows, columns, fields, resource, singular, canWrite, canDelete, emptyHint,
  transform, toFormValues,
}: {
  rows: T[];
  columns: Column<T>[];
  fields: FieldDef[];
  /** API path segment, e.g. "vehicles". */
  resource: string;
  /** "vehicle" — used in button and dialog copy. */
  singular: string;
  canWrite: boolean;
  canDelete: boolean;
  emptyHint: string;
  /** Reshapes flat form values into the API's shape. */
  transform?: (flat: Record<string, unknown>) => Record<string, unknown>;
  /** Flattens a stored row back into form values when editing. */
  toFormValues?: (row: T) => Record<string, unknown>;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  async function remove(row: T) {
    const label = (row as { name?: string; full_name?: string; reg_number?: string });
    const name = label.name ?? label.full_name ?? label.reg_number ?? "this record";
    if (!confirm(`Remove ${name}? Existing lorry receipts keep their reference to it.`)) return;

    setRemoving(row.id);
    try {
      const res = await fetch(`/api/${resource}/${row.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Could not remove");
        return;
      }
      toast.success(`${name} removed`);
      router.refresh();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">
          {rows.length} {rows.length === 1 ? singular : `${singular}s`}
        </p>
        {canWrite && (
          <Button onClick={() => setAdding(true)} size="sm">
            <Plus className="size-4" strokeWidth={1.5} />
            Add {singular}
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-[10px] border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              {columns.map((c) => (
                <th key={c.header} className={`px-3 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                  {c.header}
                </th>
              ))}
              {(canWrite || canDelete) && <th className="w-24 px-3 py-2" />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-3 py-16 text-center">
                  <p className="text-neutral-500">{emptyHint}</p>
                  {canWrite && (
                    <Button className="mt-4" onClick={() => setAdding(true)}>
                      Add your first {singular}
                    </Button>
                  )}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="row-dense hover:bg-neutral-50">
                {columns.map((c) => (
                  <td key={c.header} className={`px-3 ${c.align === "right" ? "text-right" : ""}`}>
                    {c.render(row)}
                  </td>
                ))}
                {(canWrite || canDelete) && (
                  <td className="px-3 text-right whitespace-nowrap">
                    {canWrite && (
                      <button
                        onClick={() => setEditing(row)}
                        aria-label={`Edit ${singular}`}
                        className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                      >
                        <Pencil className="size-4" strokeWidth={1.5} />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => remove(row)}
                        disabled={removing === row.id}
                        aria-label={`Remove ${singular}`}
                        className="rounded p-1.5 text-neutral-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                      >
                        <Trash2 className="size-4" strokeWidth={1.5} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RecordSheet
        open={adding}
        onOpenChange={setAdding}
        title={`Add ${singular}`}
        endpoint={`/api/${resource}`}
        method="POST"
        fields={fields}
        transform={transform}
      />

      <RecordSheet
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        title={`Edit ${singular}`}
        endpoint={editing ? `/api/${resource}/${editing.id}` : ""}
        method="PATCH"
        fields={fields}
        initial={editing ? (toFormValues ? toFormValues(editing) : editing) : undefined}
        transform={transform}
      />
    </>
  );
}
