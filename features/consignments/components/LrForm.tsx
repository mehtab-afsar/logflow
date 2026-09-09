"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import {
  Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { computeTax, type TaxMode } from "@/lib/tax";
import { toPaise, formatINR } from "@/lib/money";
import { isValidEwbNumber } from "@/lib/india/validators";
import { ewbRequired } from "@/lib/india/eway-bill";
import { RecordSheet } from "@/features/masters/components/RecordSheet";
import { PARTY_FIELDS, partyToApiShape, type PartyRow } from "@/features/masters/party-fields";

interface Party {
  id: string; name: string; gstin: string | null; state_code: string | null;
  addresses: { city?: string; state_code?: string }[] | null;
}
interface Option { id: string; label: string }

/**
 * LR creation.
 *
 * Not a wizard: one long form with a live preview of the money block, because
 * a dispatcher creating thirty of these a day needs to see the total change as
 * they type, not click Next four times. The tax line here is computed by the
 * same pure function the server uses, so the preview cannot disagree with what
 * gets saved.
 */
export function LrForm({
  branches, parties, vehicles, drivers, taxMode, orgStateCode, defaultBranchId,
}: {
  branches: Option[];
  parties: Party[];
  vehicles: Option[];
  drivers: Option[];
  taxMode: TaxMode;
  orgStateCode: string;
  /** The signed-in user's home branch (Settings), when set and still active.
   *  Falls back to branches[0] otherwise — see migration 20260910000001. */
  defaultBranchId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Parties created inline (see AddPartyField below) are appended here rather
  // than re-fetched, so the party the dispatcher just typed in is selected
  // immediately instead of waiting on a round trip.
  const [partyList, setPartyList] = useState<Party[]>(parties);
  // Which slot the "add new party" sheet is filling, if any — the sheet is
  // shared between consignor and consignee so the field list is defined once.
  const [addingParty, setAddingParty] = useState<"consignor_party_id" | "consignee_party_id" | null>(null);
  const [f, setF] = useState({
    branch_id: defaultBranchId || branches[0]?.id || "",
    consignor_party_id: "",
    consignee_party_id: "",
    origin_city: "", destination_city: "",
    distance_km: "",
    cargo_description: "",
    packages_count: "1", packages_unit: "bags",
    actual_weight_kg: "", charged_weight_kg: "",
    declared_value: "",
    customer_invoice_no: "", ewb_no: "",
    freight: "", loading: "", unloading: "", detention: "", other_charges: "",
    freight_terms: "to_be_billed",
    advance_received: "",
    vehicle_id: "", driver_id: "",
    exempt_goods: false,
    delivery_instructions: "",
  });

  const set = (k: keyof typeof f) => (v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const num = (v: string) => (v === "" ? 0 : Number(v));

  const consignee = partyList.find((p) => p.id === f.consignee_party_id);
  const consignor = partyList.find((p) => p.id === f.consignor_party_id);

  const tax = useMemo(() => {
    const taxable = num(f.freight) + num(f.loading) + num(f.unloading) + num(f.detention) + num(f.other_charges);
    try {
      return computeTax({
        taxableValuePaise: toPaise(taxable),
        mode: taxMode,
        supplierStateCode: orgStateCode,
        placeOfSupplyStateCode: consignee?.state_code ?? orgStateCode,
        exemptGoods: f.exempt_goods,
      });
    } catch {
      return null;
    }
  }, [f, taxMode, orgStateCode, consignee]);

  const ewbNeeded = ewbRequired(toPaise(num(f.declared_value)));
  const ewbBad = f.ewb_no !== "" && !isValidEwbNumber(f.ewb_no);
  const sameParty = f.consignor_party_id !== "" && f.consignor_party_id === f.consignee_party_id;
  const underCharged =
    num(f.charged_weight_kg) > 0 && num(f.charged_weight_kg) < num(f.actual_weight_kg);

  async function submit(andPrint: boolean) {
    if (ewbBad) {
      toast.error("E-way bill number must be exactly 12 digits");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/consignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch_id: f.branch_id,
          consignor_party_id: f.consignor_party_id,
          consignee_party_id: f.consignee_party_id,
          origin_city: f.origin_city || consignor?.addresses?.[0]?.city || "",
          origin_state: consignor?.state_code ?? orgStateCode,
          destination_city: f.destination_city || consignee?.addresses?.[0]?.city || "",
          destination_state: consignee?.state_code ?? orgStateCode,
          distance_km: f.distance_km ? Number(f.distance_km) : null,
          cargo_description: f.cargo_description,
          packages_count: Number(f.packages_count || 1),
          packages_unit: f.packages_unit,
          actual_weight_kg: f.actual_weight_kg ? Number(f.actual_weight_kg) : null,
          charged_weight_kg: f.charged_weight_kg ? Number(f.charged_weight_kg) : null,
          declared_value: num(f.declared_value),
          customer_invoice_no: f.customer_invoice_no || null,
          ewb_no: f.ewb_no || null,
          freight: num(f.freight),
          loading: num(f.loading),
          unloading: num(f.unloading),
          detention: num(f.detention),
          other_charges: num(f.other_charges),
          exempt_goods: f.exempt_goods,
          freight_terms: f.freight_terms,
          advance_received: num(f.advance_received),
          vehicle_id: f.vehicle_id || null,
          driver_id: f.driver_id || null,
          delivery_instructions: f.delivery_instructions || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Could not create the lorry receipt");
        return;
      }
      toast.success(`${json.data.lr_no} created`);
      if (andPrint) window.open(`/api/consignments/${json.data.id}/lr.pdf`, "_blank");
      router.push(`/consignments/${json.data.id}`);
    } finally {
      setBusy(false);
    }
  }

  const ready =
    f.branch_id && f.consignor_party_id && f.consignee_party_id && f.cargo_description && num(f.freight) > 0;

  return (
    <>
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card title="Parties">
          <Row>
            <Select label="Branch" value={f.branch_id} onChange={set("branch_id")} options={branches} />
            <Picker
              label="Consignor"
              value={f.consignor_party_id}
              onChange={set("consignor_party_id")}
              options={partyList.map((p) => ({
                value: p.id,
                label: p.name,
                detail: [p.gstin, p.addresses?.[0]?.city].filter(Boolean).join(" · "),
              }))}
              searchPlaceholder="Type three letters…"
              onAddNew={() => setAddingParty("consignor_party_id")}
            />
            <Picker
              label="Consignee"
              value={f.consignee_party_id}
              onChange={set("consignee_party_id")}
              options={partyList.map((p) => ({
                value: p.id,
                label: p.name,
                detail: [p.gstin, p.addresses?.[0]?.city].filter(Boolean).join(" · "),
              }))}
              searchPlaceholder="Type three letters…"
              onAddNew={() => setAddingParty("consignee_party_id")}
            />
          </Row>
          {sameParty && (
            <Note tone="warn">Consignor and consignee are the same party. Continue only if that is intended.</Note>
          )}
          <Row>
            <Field label="From city" value={f.origin_city} onChange={set("origin_city")} placeholder={consignor?.addresses?.[0]?.city ?? "Bengaluru"} />
            <Field label="To city" value={f.destination_city} onChange={set("destination_city")} placeholder={consignee?.addresses?.[0]?.city ?? ""} />
            <Field label="Distance (km)" value={f.distance_km} onChange={set("distance_km")} type="number" />
          </Row>
        </Card>

        <Card title="Cargo & compliance">
          <Row>
            <Field label="Description of goods" value={f.cargo_description} onChange={set("cargo_description")} />
            <Field label="Packages" value={f.packages_count} onChange={set("packages_count")} type="number" />
            <Field label="Unit" value={f.packages_unit} onChange={set("packages_unit")} />
          </Row>
          <Row>
            <Field label="Actual weight (kg)" value={f.actual_weight_kg} onChange={set("actual_weight_kg")} type="number" />
            <Field label="Charged weight (kg)" value={f.charged_weight_kg} onChange={set("charged_weight_kg")} type="number" />
            <Field label="Declared value (₹)" value={f.declared_value} onChange={set("declared_value")} type="number" />
          </Row>
          {underCharged && (
            <Note tone="warn">Charged weight is below actual weight. Check before saving.</Note>
          )}
          <Row>
            <Field label="Customer invoice no." value={f.customer_invoice_no} onChange={set("customer_invoice_no")} />
            <Field
              label="E-way bill no."
              value={f.ewb_no}
              onChange={set("ewb_no")}
              error={ewbBad ? "E-way bill number must be exactly 12 digits" : undefined}
            />
          </Row>
          {ewbNeeded && !f.ewb_no && (
            <Note tone="warn">
              Declared value is ₹50,000 or more, so an e-way bill is normally required. Some goods are exempt.
            </Note>
          )}
        </Card>

        <Card title="Commercials">
          <Row>
            <Field label="Freight (₹)" value={f.freight} onChange={set("freight")} type="number" />
            <Field label="Loading (₹)" value={f.loading} onChange={set("loading")} type="number" />
            <Field label="Unloading (₹)" value={f.unloading} onChange={set("unloading")} type="number" />
          </Row>
          <Row>
            <Field label="Detention (₹)" value={f.detention} onChange={set("detention")} type="number" />
            <Field label="Other charges (₹)" value={f.other_charges} onChange={set("other_charges")} type="number" />
            <Field label="Advance received (₹)" value={f.advance_received} onChange={set("advance_received")} type="number" />
          </Row>
          <Row>
            <Select
              label="Freight terms"
              value={f.freight_terms}
              onChange={set("freight_terms")}
              options={[
                { id: "to_be_billed", label: "To be billed" },
                { id: "paid", label: "Paid" },
                { id: "to_pay", label: "To pay" },
              ]}
            />
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={f.exempt_goods}
                onChange={(e) => set("exempt_goods")(e.target.checked)}
                className="size-4"
              />
              Exempt goods (no GST)
            </label>
          </Row>
        </Card>

        <Card title="Assignment">
          <Row>
            <Picker
              label="Vehicle"
              value={f.vehicle_id}
              onChange={set("vehicle_id")}
              options={vehicles.map((v) => ({ value: v.id, label: v.label }))}
              allowClear
              placeholder="Not assigned"
              searchPlaceholder="Registration or type…"
            />
            <Picker
              label="Driver"
              value={f.driver_id}
              onChange={set("driver_id")}
              options={drivers.map((d) => ({ value: d.id, label: d.label }))}
              allowClear
              placeholder="Not assigned"
              searchPlaceholder="Name or number…"
            />
            <Field label="Delivery instructions" value={f.delivery_instructions} onChange={set("delivery_instructions")} />
          </Row>
        </Card>
      </div>

      {/* Live money preview — mirrors what will print. */}
      <aside className="h-fit rounded-[10px] border bg-white p-5 xl:sticky xl:top-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">
          As it will print
        </h2>
        <dl className="mt-3 space-y-1.5 text-sm">
          <Line label="Freight" value={num(f.freight)} />
          {num(f.loading) > 0 && <Line label="Loading" value={num(f.loading)} />}
          {num(f.unloading) > 0 && <Line label="Unloading" value={num(f.unloading)} />}
          {num(f.detention) > 0 && <Line label="Detention" value={num(f.detention)} />}
          {num(f.other_charges) > 0 && <Line label="Other" value={num(f.other_charges)} />}

          <div className="border-t pt-1.5">
            <Line label="Taxable value" value={(tax?.taxableValuePaise ?? 0) / 100} />
          </div>

          {tax?.reason === "rcm" && (
            <p className="pt-2 text-xs leading-relaxed text-ink-3">{tax.note}</p>
          )}
          {tax?.reason === "exempt" && <p className="pt-2 text-xs text-ink-3">{tax.note}</p>}
          {tax?.reason === "inter_state" && (
            <Line label={`IGST @ ${tax.ratePct}%`} value={tax.igstPaise / 100} />
          )}
          {tax?.reason === "intra_state" && (
            <>
              <Line label={`CGST @ ${tax.ratePct / 2}%`} value={tax.cgstPaise / 100} />
              <Line label={`SGST @ ${tax.ratePct / 2}%`} value={tax.sgstPaise / 100} />
            </>
          )}

          <div className="border-t pt-1.5 font-medium">
            <Line label="Total" value={(tax?.invoiceTotalPaise ?? 0) / 100} />
          </div>
        </dl>

        <div className="mt-5 space-y-2">
          <Button className="w-full" disabled={!ready || busy} onClick={() => submit(true)}>
            {busy ? "Saving…" : "Save & print"}
          </Button>
          <Button variant="outline" className="w-full" disabled={!ready || busy} onClick={() => submit(false)}>
            Save draft
          </Button>
        </div>
      </aside>
    </div>

    <RecordSheet
      open={addingParty !== null}
      onOpenChange={(v) => !v && setAddingParty(null)}
      title="Add party"
      description="Saved to Parties, and selected here immediately."
      endpoint="/api/parties"
      method="POST"
      fields={PARTY_FIELDS}
      transform={partyToApiShape}
      onSaved={(created) => {
        if (!created || !addingParty) return;
        const party = created as unknown as PartyRow;
        setPartyList((prev) => [...prev, party as unknown as Party]);
        set(addingParty)(party.id);
        setAddingParty(null);
      }}
    />
    </>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-[10px] border bg-white p-5">
      <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">{title}</h2>
      {children}
    </section>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-3">{children}</div>;
}
function Field({
  label, value, onChange, type = "text", placeholder, error,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; error?: string;
}) {
  // htmlFor/id must actually match, or the label is decoration: a screen
  // reader announces nothing and the field is unreachable by name.
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-ink-2">{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
      />
      {error && <p id={errorId} className="text-xs text-alert">{error}</p>}
    </div>
  );
}
function Select({
  label, value, onChange, options, allowEmpty,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: Option[]; allowEmpty?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-ink-2">{label}</Label>
      <UiSelect value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={allowEmpty ? "Not assigned" : "Select…"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </UiSelect>
    </div>
  );
}

/** A searchable picker, for the lists that outgrow a dropdown. */
function Picker({
  label, value, onChange, options, allowClear, placeholder, searchPlaceholder, onAddNew,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; detail?: string }[];
  allowClear?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Opens the inline "add new party" sheet. Only consignor/consignee take
   *  this — vehicles and drivers already have a fast path through Fleet, and
   *  a party is the one master an LR cannot be started without. */
  onAddNew?: () => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-xs text-ink-2">{label}</Label>
        {onAddNew && (
          <button
            type="button"
            onClick={onAddNew}
            className="text-xs font-medium text-indigo-ink hover:text-indigo-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink"
          >
            + New party
          </button>
        )}
      </div>
      <Combobox
        id={id}
        value={value}
        onChange={onChange}
        options={options}
        allowClear={allowClear}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
      />
    </div>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-2">{label}</dt>
      <dd className="tabular">{formatINR(Math.round(value * 100))}</dd>
    </div>
  );
}
function Note({ tone, children }: { tone: "warn"; children: React.ReactNode }) {
  return (
    <p className={`rounded-md p-2.5 text-xs ${tone === "warn" ? "bg-marigold-tint text-marigold-ink" : ""}`}>
      {children}
    </p>
  );
}
