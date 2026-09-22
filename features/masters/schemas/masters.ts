import { z } from "zod";
import { isValidGstin, isValidRegNumber, isValidDlNumber, normaliseIndianPhone } from "@/lib/india/validators";

/**
 * A phone field that accepts what a person actually types — spaces, a +91,
 * a leading 0 — and stores the bare 10 digits. Schema-level, not just the
 * form: a direct API call should get the same tolerance the UI does, not a
 * stricter one.
 */
const indianMobile = z
  .string()
  .trim()
  .transform((v) => (v === "" ? v : normaliseIndianPhone(v)))
  .refine((v) => v === "" || /^[6-9]\d{9}$/.test(v), "must be a 10-digit mobile number");

/**
 * One schema per master, shared by the form and the route handler.
 *
 * The GSTIN and registration checks go beyond shape: a mistyped GSTIN passes a
 * regex but is rejected by the GST portal months later, when the customer
 * disputes the invoice. Catching it at entry is the whole point of a master.
 */

const stateCode = z.string().regex(/^\d{2}$/, "must be a 2-digit state code");

export const addressSchema = z.object({
  label: z.string().max(60).optional().nullable(),
  line1: z.string().min(1, "address is required").max(200),
  line2: z.string().max(200).optional().nullable(),
  city: z.string().min(1, "city is required").max(120),
  state_code: stateCode,
  pincode: z.string().regex(/^[1-9]\d{5}$/, "must be a 6-digit pincode").optional().nullable(),
});

export const partySchema = z.object({
  name: z.string().min(2, "name is required").max(200),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || isValidGstin(v), "that GSTIN is not valid — check the digits")
    .optional()
    .nullable(),
  state_code: stateCode.optional().nullable(),
  phone: indianMobile.optional().nullable(),
  email: z.email("that email is not valid").optional().nullable().or(z.literal("")),
  party_role: z.enum(["consignor", "consignee", "both", "vendor"]).default("both"),
  addresses: z.array(addressSchema).max(5).default([]),
  notes: z.string().max(1000).optional().nullable(),
});

export type PartyInput = z.infer<typeof partySchema>;

export const VEHICLE_TYPES = [
  "32ft SXL", "32ft MXL", "22ft", "19ft Open", "24ft",
  "Trailer 40ft", "Tanker", "Container 20ft", "Tipper", "Other",
] as const;

const expiry = z.iso.date("use a valid date").optional().nullable().or(z.literal(""));

export const vehicleSchema = z
  .object({
    reg_number: z
      .string()
      .trim()
      .toUpperCase()
      .refine(isValidRegNumber, "not a valid registration, e.g. KA-01-AB-1234"),
    vehicle_type: z.string().min(1, "pick a vehicle type").max(60),
    capacity_tons: z.number().min(0).max(100).optional().nullable(),
    ownership: z.enum(["own", "attached"]).default("own"),
    // Who an attached truck is hired from. The DB rejects this set on an
    // 'own' vehicle (vehicles_owner_only_when_attached_chk) — checked here
    // too so the UI can say why, rather than surface a raw 23514.
    owner_party_id: z.string().uuid().optional().nullable(),
    rc_expiry: expiry,
    fitness_expiry: expiry,
    insurance_expiry: expiry,
    permit_expiry: expiry,
    puc_expiry: expiry,
  })
  .refine((v) => v.ownership === "attached" || !v.owner_party_id, {
    message: "only an attached vehicle can have a vendor",
    path: ["owner_party_id"],
  });

export type VehicleInput = z.infer<typeof vehicleSchema>;

export const driverSchema = z.object({
  full_name: z.string().min(2, "name is required").max(120),
  // A driver's phone is required, so "" must still fail — indianMobile's
  // optional-field allowance for "" does not apply here.
  phone: z
    .string()
    .trim()
    .transform(normaliseIndianPhone)
    .refine((v) => /^[6-9]\d{9}$/.test(v), "must be a 10-digit mobile number"),
  dl_number: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || isValidDlNumber(v), "not a valid licence, e.g. KA05 20180001234")
    .optional()
    .nullable(),
  dl_expiry: expiry,
  language: z.enum(["en", "hi", "kn"]).default("hi"),
});

export type DriverInput = z.infer<typeof driverSchema>;

/** Org-configurable additional-charge type (freight, loading, detention, ...). */
export const chargeTypeSchema = z.object({
  code: z.string().trim().min(1, "code is required").max(30).toUpperCase(),
  label: z.string().trim().min(1, "label is required").max(60),
  default_billable_to_consignor: z.boolean().default(true),
  default_billable_to_vendor: z.boolean().default(false),
});

export type ChargeTypeInput = z.infer<typeof chargeTypeSchema>;

/** A standing rate agreed with a consignor or vendor — see migration 16. */
export const contractSchema = z.object({
  branch_id: z.string().uuid().optional().nullable(),
  counterparty_type: z.enum(["consignor", "vendor"]),
  party_id: z.string().uuid(),
  route_origin_city: z.string().max(120).optional().nullable(),
  route_origin_state: stateCode.optional().nullable(),
  route_destination_city: z.string().max(120).optional().nullable(),
  route_destination_state: stateCode.optional().nullable(),
  vehicle_type: z.string().max(60).optional().nullable(),
  freight_basis: z.enum(["per_trip", "per_ton"]).default("per_trip"),
  rate: z.number().min(0).max(99_999_999),
  valid_from: z.iso.date(),
  valid_to: z.iso.date().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export type ContractInput = z.infer<typeof contractSchema>;
