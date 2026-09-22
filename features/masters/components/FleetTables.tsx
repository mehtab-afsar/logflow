"use client";

import { MastersTable, type Column } from "./MastersTable";
import type { FieldDef } from "./RecordSheet";
import { VEHICLE_TYPES } from "../schemas/masters";
import { formatDate, daysUntil } from "@/lib/india/format";
import { expiryTone } from "@/lib/design/tokens";

interface Vehicle {
  id: string; reg_number: string; vehicle_type: string;
  capacity_tons: number | null; ownership: string; owner_party_id: string | null;
  rc_expiry: string | null; fitness_expiry: string | null;
  insurance_expiry: string | null; permit_expiry: string | null; puc_expiry: string | null;
}

interface VendorOption { id: string; name: string; }

interface Driver {
  id: string; full_name: string; phone: string;
  dl_number: string | null; dl_expiry: string | null; language: string;
}

const DOCS = [
  { key: "fitness_expiry", label: "Fitness" },
  { key: "insurance_expiry", label: "Insurance" },
  { key: "permit_expiry", label: "Permit" },
  { key: "puc_expiry", label: "PUC" },
] as const;

/** A date rendered as urgency, not just a date. */
function ExpiryCell({ value }: { value: string | null }) {
  const left = daysUntil(value);
  const tone = expiryTone(left);

  if (!value) return <span className="text-ink-3">—</span>;

  return (
    <span
      title={formatDate(value)}
      className={
        tone.tone === "ok"
          ? "text-ink-3"
          : `inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${tone.className}`
      }
    >
      {tone.tone === "expired"
        ? `Expired ${formatDate(value)}`
        : tone.tone === "ok"
          ? formatDate(value)
          : `${left} d left`}
    </span>
  );
}

/** vendors: parties marked party_role='vendor', for the "hired from" picker
 *  below — only relevant once ownership is switched to 'attached'. */
function vehicleFields(vendors: VendorOption[]): FieldDef[] {
  return [
    { name: "reg_number", label: "Registration number", required: true, half: true, placeholder: "KA-01-AB-1234", hint: "Any separators are fine" },
    { name: "vehicle_type", label: "Type", kind: "select", required: true, half: true, options: VEHICLE_TYPES.map((t) => ({ value: t, label: t })) },
    { name: "capacity_tons", label: "Capacity (tonnes)", kind: "number", half: true },
    { name: "ownership", label: "Ownership", kind: "select", half: true, defaultValue: "own", options: [{ value: "own", label: "Own" }, { value: "attached", label: "Attached" }] },
    {
      name: "owner_party_id", label: "Hired from (vendor)", kind: "combobox", half: true,
      hint: vendors.length === 0 ? "Mark a party as a vendor first" : "Who this truck is attached from",
      options: vendors.map((v) => ({ value: v.id, label: v.name })),
      showIf: (values) => values.ownership === "attached",
    },
    { name: "fitness_expiry", label: "Fitness expiry", kind: "date", half: true },
    { name: "insurance_expiry", label: "Insurance expiry", kind: "date", half: true },
    { name: "permit_expiry", label: "Permit expiry", kind: "date", half: true },
    { name: "puc_expiry", label: "PUC expiry", kind: "date", half: true },
    { name: "rc_expiry", label: "RC expiry", kind: "date", half: true },
  ];
}

const DRIVER_FIELDS: FieldDef[] = [
  { name: "full_name", label: "Name", required: true },
  { name: "phone", label: "Mobile", kind: "tel", required: true, half: true, placeholder: "9876543210", hint: "10 digits, no country code" },
  { name: "language", label: "Portal language", kind: "select", half: true, defaultValue: "hi", options: [{ value: "hi", label: "हिन्दी" }, { value: "kn", label: "ಕನ್ನಡ" }, { value: "en", label: "English" }] },
  { name: "dl_number", label: "Licence number", half: true, placeholder: "KA05 20180001234" },
  { name: "dl_expiry", label: "Licence expiry", kind: "date", half: true },
];

export function VehiclesTable({
  rows, canWrite, canDelete, vendors = [],
}: {
  rows: Vehicle[]; canWrite: boolean; canDelete: boolean; vendors?: VendorOption[];
}) {
  const vendorName = (id: string | null) => vendors.find((v) => v.id === id)?.name;

  const columns: Column<Vehicle>[] = [
    { header: "Vehicle", render: (v) => <span className="font-mono font-medium">{v.reg_number}</span> },
    { header: "Type", render: (v) => <span className="text-ink-2">{v.vehicle_type}</span> },
    { header: "Capacity", render: (v) => <span className="text-ink-2">{v.capacity_tons ? `${v.capacity_tons} t` : "—"}</span> },
    {
      header: "Ownership",
      render: (v) => (
        <span className="text-ink-2">
          <span className="capitalize">{v.ownership}</span>
          {v.ownership === "attached" && vendorName(v.owner_party_id) && (
            <span className="text-ink-3"> · {vendorName(v.owner_party_id)}</span>
          )}
        </span>
      ),
    },
    ...DOCS.map((d) => ({
      header: d.label,
      render: (v: Vehicle) => <ExpiryCell value={v[d.key]} />,
    })),
  ];

  return (
    <MastersTable
      rows={rows}
      columns={columns}
      fields={vehicleFields(vendors)}
      resource="vehicles"
      singular="vehicle"
      canWrite={canWrite}
      canDelete={canDelete}
      emptyHint="No vehicles yet. Add your trucks so they can be assigned to a lorry receipt."
    />
  );
}

export function DriversTable({ rows, canWrite, canDelete }: { rows: Driver[]; canWrite: boolean; canDelete: boolean }) {
  const LANG: Record<string, string> = { en: "English", hi: "हिन्दी", kn: "ಕನ್ನಡ" };

  const columns: Column<Driver>[] = [
    { header: "Driver", render: (d) => <span className="font-medium">{d.full_name}</span> },
    { header: "Mobile", render: (d) => <span className="font-mono text-ink-2">{d.phone}</span> },
    { header: "Licence", render: (d) => <span className="font-mono text-ink-2">{d.dl_number ?? "—"}</span> },
    { header: "Expires", render: (d) => <ExpiryCell value={d.dl_expiry} /> },
    { header: "Portal language", render: (d) => <span className="text-ink-2">{LANG[d.language] ?? d.language}</span> },
  ];

  return (
    <MastersTable
      rows={rows}
      columns={columns}
      fields={DRIVER_FIELDS}
      resource="drivers"
      singular="driver"
      canWrite={canWrite}
      canDelete={canDelete}
      emptyHint="No drivers yet. Add them with a mobile number so you can send the trip link over WhatsApp."
    />
  );
}
