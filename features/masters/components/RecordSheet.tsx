"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";

/**
 * The add/edit surface for every master record.
 *
 * A sheet rather than a page: a dispatcher adding a truck mid-LR must not lose
 * the form they were filling in. Server validation messages are shown against
 * the field that caused them, because "Invalid input" tells a dispatcher
 * nothing — the API already returns "not a valid registration, e.g.
 * KA-01-AB-1234" and this surfaces it verbatim.
 */

/** `combobox` is `select` with a search box — used once a list passes roughly
 *  eight options, where scrolling stops being faster than typing. */
export type FieldKind = "text" | "number" | "date" | "select" | "combobox" | "tel";

export interface FieldDef {
  name: string;
  label: string;
  kind?: FieldKind;
  placeholder?: string;
  hint?: string;
  options?: { value: string; label: string }[];
  /** Half-width on wide screens. */
  half?: boolean;
  required?: boolean;
  /** Pre-selected when creating. A select left on a placeholder sends nothing,
   *  so anything with a sensible default should say so here. */
  defaultValue?: string;
}

interface RecordSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  endpoint: string;
  method: "POST" | "PATCH";
  fields: FieldDef[];
  initial?: Record<string, unknown>;
  onSaved?: (created?: Record<string, unknown>) => void;
  /** Reshapes the flat form values before sending. Used where the stored shape
   *  differs from the shape that is comfortable to type — a party's address is
   *  four fields on screen and one jsonb array in the row. */
  transform?: (flat: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * The sheet only decides whether the form exists. Mounting the form fresh each
 * time it opens is what resets it — no effect, no stale values, and no
 * synchronous setState during render.
 */
export function RecordSheet(props: RecordSheetProps) {
  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{props.title}</SheetTitle>
          {props.description && <SheetDescription>{props.description}</SheetDescription>}
        </SheetHeader>
        {props.open && <RecordForm {...props} />}
      </SheetContent>
    </Sheet>
  );
}

function RecordForm({
  onOpenChange, title, endpoint, method, fields, initial, onSaved, transform,
}: RecordSheetProps) {
  const router = useRouter();
  const formId = useId();

  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const f of fields) {
      const v = initial?.[f.name];
      seed[f.name] = v === null || v === undefined ? (f.defaultValue ?? "") : String(v);
    }
    return seed;
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (name: string, v: string) => setValues((p) => ({ ...p, [name]: v }));

  /** The field the server complained about, so it can be highlighted. */
  const errorField = error?.includes(":") ? error.split(":")[0].trim() : null;
  const errorText = error?.includes(":") ? error.slice(error.indexOf(":") + 1).trim() : error;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = values[f.name] ?? "";

      // An untouched select or combobox is omitted rather than sent as "". A
      // Zod enum rejects the empty string instead of falling back to its
      // default, so sending it would fail validation on a field the user never
      // saw. This is the fix from the earlier bug; it now covers both kinds.
      if ((f.kind === "select" || f.kind === "combobox") && raw === "") continue;

      payload[f.name] = f.kind === "number" ? (raw === "" ? null : Number(raw)) : raw;
    }

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(transform ? transform(payload) : payload),
      });
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Could not save");
        return;
      }
      toast.success(method === "POST" ? `${title.replace(/^(Add|Edit) /, "")} saved` : "Changes saved");
      onOpenChange(false);
      onSaved?.(json.data);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
        <form id={formId} onSubmit={submit} className="grid flex-1 grid-cols-2 gap-4 px-4 py-2">
          {fields.map((f) => {
            const id = `${formId}-${f.name}`;
            const invalid = errorField === f.name;
            return (
              <div key={f.name} className={f.half ? "col-span-1 space-y-1.5" : "col-span-2 space-y-1.5"}>
                <Label htmlFor={id} className="text-xs text-ink-2">
                  {f.label}
                  {f.required && <span className="ml-0.5 text-alert">*</span>}
                </Label>

                {f.kind === "combobox" ? (
                  <Combobox
                    id={id}
                    value={values[f.name] ?? ""}
                    onChange={(v) => set(f.name, v)}
                    options={(f.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
                    ariaInvalid={invalid}
                    allowClear
                  />
                ) : f.kind === "select" ? (
                  <Select value={values[f.name] ?? ""} onValueChange={(v) => set(f.name, v)}>
                    <SelectTrigger id={id} className="w-full" aria-invalid={invalid}>
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(f.options ?? []).map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={id}
                    type={f.kind === "number" ? "number" : f.kind === "date" ? "date" : f.kind === "tel" ? "tel" : "text"}
                    inputMode={f.kind === "tel" ? "numeric" : undefined}
                    value={values[f.name] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.name, e.target.value)}
                    aria-invalid={invalid}
                    aria-describedby={invalid ? `${id}-err` : f.hint ? `${id}-hint` : undefined}
                  />
                )}

                {invalid && (
                  <p id={`${id}-err`} className="text-xs text-alert">{errorText}</p>
                )}
                {!invalid && f.hint && (
                  <p id={`${id}-hint`} className="text-xs text-ink-3">{f.hint}</p>
                )}
              </div>
            );
          })}

          {error && !errorField && (
            <p role="alert" className="col-span-2 rounded-md bg-alert-tint p-2.5 text-sm text-alert">
              {error}
            </p>
          )}
        </form>

        <div className="flex gap-2 border-t p-4">
          <Button type="submit" form={formId} disabled={busy} className="flex-1">
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
    </>
  );
}
