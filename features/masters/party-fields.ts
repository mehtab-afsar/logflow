import type { FieldDef } from "./components/RecordSheet";
import { GST_STATE_OPTIONS } from "@/lib/india/states";

export interface PartyAddress {
  label?: string; line1?: string; city?: string; state_code?: string; pincode?: string;
}

export interface PartyRow {
  id: string; name: string; gstin: string | null; state_code: string | null;
  phone: string | null; email: string | null; addresses: PartyAddress[] | null; party_role: string;
}

/**
 * The address is not optional in practice.
 *
 * A lorry receipt freezes the consignor's and consignee's address onto itself,
 * and the LR form falls back to the party's city for the route. A party saved
 * without one produces an LR that cannot be created — so the city and state are
 * collected here, and the four fields are folded into the single stored address.
 *
 * Shared, not duplicated: the Parties page and the add-party sheet inside the
 * LR form must collect exactly the same fields, or a party created mid-LR is a
 * second-class record missing whatever the other form asks for.
 */
export const PARTY_FIELDS: FieldDef[] = [
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
    name: "state_code", label: "State", kind: "combobox", half: true,
    hint: "Filled from the GSTIN when you enter one",
    options: GST_STATE_OPTIONS.map((s) => ({ value: s.code, label: `${s.code} · ${s.name}` })),
  },
  { name: "pincode", label: "Pincode", half: true, placeholder: "560058" },
  { name: "phone", label: "Mobile", kind: "tel", half: true, placeholder: "9876543210" },
  { name: "email", label: "Email", half: true },
];

/** Four flat fields on screen → the one stored address the LR snapshot needs. */
export function partyToApiShape(flat: Record<string, unknown>): Record<string, unknown> {
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
export function partyToFormValues(p: PartyRow): Record<string, unknown> {
  const a = p.addresses?.[0] ?? {};
  return {
    ...p,
    line1: a.line1 ?? "",
    city: a.city ?? "",
    state_code: p.state_code ?? a.state_code ?? "",
    pincode: a.pincode ?? "",
  };
}
