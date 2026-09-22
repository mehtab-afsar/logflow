"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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

interface ChargeType {
  id: string; code: string; label: string;
  default_billable_to_consignor: boolean; default_billable_to_vendor: boolean;
}
interface ChargeLine {
  charge_type_id: string; description: string; amount: string;
  billable_to_consignor: boolean; billable_to_vendor: boolean;
}

const FREIGHT_BASIS_LABEL: Record<string, string> = { per_trip: "per trip", per_ton: "per ton" };

interface Party {
  id: string; name: string; gstin: string | null; state_code: string | null;
  addresses: { city?: string; state_code?: string }[] | null;
  party_role: string;
}

/**
 * A real filter, not a sort. The first version of this put a matching role
 * first and left everyone else in the list below it — which still showed a
 * consignee-only party in the Consignor picker, just lower down. Reported
 * back directly: two parties, one tagged each way, and the consignor field
 * still offered both. Consignor and consignee are separate the same way
 * vehicles and drivers are — a party marked "consignee" does not appear as
 * a consignor option, full stop. "both" is the one deliberate exception:
 * it exists in the schema for a party genuinely used either way, and
 * matches both fields.
 */
function partiesFor(list: Party[], role: "consignor" | "consignee") {
  return list.filter((p) => p.party_role === role || p.party_role === "both");
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
  branches, parties, vehicles, drivers, taxMode, orgStateCode, defaultBranchId, reservation, chargeTypes,
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
  /** Set when reconciling a blank paper form: the LR number and branch were
   *  already fixed the moment the number was printed and handed out. */
  reservation?: { id: string; lr_no: string; branch_id: string; reserved_date: string };
  /** Org-configurable charge types (migration 20260915000001). Replaces the
   *  old 4 fixed freight/loading/unloading/detention/other_charges fields. */
  chargeTypes: ChargeType[];
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
  const freightTypeId = chargeTypes.find((c) => c.code === "FREIGHT")?.id ?? chargeTypes[0]?.id ?? "";
  const [lines, setLines] = useState<ChargeLine[]>([
    { charge_type_id: freightTypeId, description: "", amount: "", billable_to_consignor: true, billable_to_vendor: false },
  ]);
  const [f, setF] = useState({
    branch_id: reservation?.branch_id || defaultBranchId || branches[0]?.id || "",
    consignor_party_id: "",
    consignee_party_id: "",
    origin_city: "", destination_city: "",
    distance_km: "",
    cargo_description: "",
    packages_count: "1", packages_unit: "bags",
    actual_weight_kg: "", charged_weight_kg: "",
    declared_value: "",
    customer_invoice_no: "", ewb_no: "",
    freight_terms: "to_be_billed",
    advance_received: "",
    vehicle_id: "", driver_id: "",
    exempt_goods: false,
    delivery_instructions: "",
  });

  const set = (k: keyof typeof f) => (v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const num = (v: string) => (v === "" ? 0 : Number(v));

  function addLine() {
    setLines((prev) => [
      ...prev,
      { charge_type_id: freightTypeId, description: "", amount: "", billable_to_consignor: true, billable_to_vendor: false },
    ]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateLine(i: number, patch: Partial<ChargeLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  const chargeTypeLabel = (id: string) => chargeTypes.find((c) => c.id === id)?.label ?? "";
  // taxable_value is the sum of amount where billable_to_consignor — same rule
  // the API route applies server-side (see app/api/consignments/route.ts).
  const taxableTotal = lines.reduce((sum, l) => (l.billable_to_consignor ? sum + num(l.amount) : sum), 0);

  const consignee = partyList.find((p) => p.id === f.consignee_party_id);
  const consignor = partyList.find((p) => p.id === f.consignor_party_id);

  // A standing rate for this consignor/route, suggested — never applied
  // automatically — the moment enough is known to look one up.
  const [contractSuggestion, setContractSuggestion] = useState<{ rate: number; freight_basis: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!f.consignor_party_id) {
      Promise.resolve().then(() => { if (!cancelled) setContractSuggestion(null); });
      return () => { cancelled = true; };
    }
    const params = new URLSearchParams({ counterparty_type: "consignor", party_id: f.consignor_party_id });
    if (f.origin_city) params.set("origin_city", f.origin_city);
    if (f.destination_city) params.set("destination_city", f.destination_city);
    fetch(`/api/contracts/lookup?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled) setContractSuggestion(json?.data ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [f.consignor_party_id, f.origin_city, f.destination_city]);

  function useContractRate() {
    if (!contractSuggestion) return;
    updateLine(0, { amount: String(contractSuggestion.rate) });
  }

  const tax = useMemo(() => {
    const taxable = taxableTotal;
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
  }, [taxableTotal, f.exempt_goods, taxMode, orgStateCode, consignee]);

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
          ...(reservation ? { reservation_id: reservation.id } : {}),
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
          charge_lines: lines
            .filter((l) => l.charge_type_id && num(l.amount) > 0)
            .map((l) => ({
              charge_type_id: l.charge_type_id,
              description: l.description || null,
              amount: num(l.amount),
              billable_to_consignor: l.billable_to_consignor,
              billable_to_vendor: l.billable_to_vendor,
            })),
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
    f.branch_id && f.consignor_party_id && f.consignee_party_id && f.cargo_description &&
    lines.some((l) => l.charge_type_id && num(l.amount) > 0);

  return (
    <>
    {reservation && (
      <div className="mb-4 rounded-md border border-dashed border-line bg-line-soft px-4 py-3 text-sm text-ink-2">
        Reconciling blank form <span className="font-mono font-medium text-ink">{reservation.lr_no}</span>,
        reserved {reservation.reserved_date} — the branch and LR number are fixed and cannot be changed here.
      </div>
    )}
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <Card title="Parties">
          <Row>
            <Select
              label="Branch"
              value={f.branch_id}
              onChange={set("branch_id")}
              options={branches}
              disabled={!!reservation}
            />
            <Picker
              label="Consignor"
              value={f.consignor_party_id}
              onChange={set("consignor_party_id")}
              options={partiesFor(partyList, "consignor").map((p) => ({
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
              options={partiesFor(partyList, "consignee").map((p) => ({
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
          <div className="space-y-2">
            {lines.map((line, i) => {
              const id = `charge-${i}`;
              return (
                <div key={i} className="grid grid-cols-1 items-end gap-2 rounded-md border p-2.5 sm:grid-cols-[1fr_1.4fr_120px_auto_auto_auto]">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${id}-type`} className="text-xs text-ink-2">Charge type</Label>
                    <UiSelect
                      value={line.charge_type_id}
                      onValueChange={(v) => updateLine(i, { charge_type_id: v })}
                    >
                      <SelectTrigger id={`${id}-type`} className="w-full">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {chargeTypes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </UiSelect>
                  </div>
                  <Field
                    label="Description"
                    value={line.description}
                    onChange={(v) => updateLine(i, { description: v })}
                    placeholder={chargeTypeLabel(line.charge_type_id)}
                  />
                  <Field
                    label="Amount (₹)"
                    value={line.amount}
                    onChange={(v) => updateLine(i, { amount: v })}
                    type="number"
                  />
                  <label className="flex items-center gap-1.5 pb-2 text-xs text-ink-2">
                    <input
                      type="checkbox"
                      checked={line.billable_to_consignor}
                      onChange={(e) => updateLine(i, { billable_to_consignor: e.target.checked })}
                      className="size-4"
                    />
                    Bill consignor
                  </label>
                  <label className="flex items-center gap-1.5 pb-2 text-xs text-ink-2">
                    <input
                      type="checkbox"
                      checked={line.billable_to_vendor}
                      onChange={(e) => updateLine(i, { billable_to_vendor: e.target.checked })}
                      className="size-4"
                    />
                    Vendor payable
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="justify-self-end"
                    disabled={lines.length === 1}
                    onClick={() => removeLine(i)}
                    aria-label="Remove charge line"
                  >
                    <Trash2 className="size-4" strokeWidth={1.5} />
                  </Button>
                </div>
              );
            })}
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              + Add charge line
            </Button>
            {contractSuggestion && (
              <div className="flex items-center justify-between rounded-md border border-dashed border-line bg-line-soft px-3 py-2 text-xs text-ink-2">
                <span>
                  Standing rate for this consignor{f.origin_city || f.destination_city ? " and route" : ""}:{" "}
                  <span className="font-medium text-ink">{formatINR(Math.round(contractSuggestion.rate * 100))}</span>
                  {" "}{FREIGHT_BASIS_LABEL[contractSuggestion.freight_basis] ?? contractSuggestion.freight_basis}.
                </span>
                <Button type="button" variant="outline" size="sm" onClick={useContractRate}>
                  Use this rate
                </Button>
              </div>
            )}
          </div>
          <Row>
            <Field label="Advance received (₹)" value={f.advance_received} onChange={set("advance_received")} type="number" />
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
          {lines.filter((l) => num(l.amount) > 0).map((l, i) => (
            <Line
              key={i}
              label={l.description || chargeTypeLabel(l.charge_type_id) || "Charge"}
              value={num(l.amount)}
            />
          ))}

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
      // Preset to the slot that opened the sheet rather than the generic
      // "Either" default — a party added from the Consignee field is a
      // consignee, and now that the two pickers are properly separated,
      // leaving this at "Either" would make the party invisible on the
      // OTHER field where it was never intended to appear anyway, but
      // silently absent from neither until someone opens the Parties page.
      initial={{ party_role: addingParty === "consignor_party_id" ? "consignor" : "consignee" }}
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
  label, value, onChange, options, allowEmpty, disabled,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: Option[]; allowEmpty?: boolean; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-ink-2">{label}</Label>
      <UiSelect value={value} onValueChange={onChange} disabled={disabled}>
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
