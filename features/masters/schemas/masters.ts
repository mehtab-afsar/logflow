import { z } from "zod";
import { isValidGstin, isValidRegNumber, isValidDlNumber } from "@/lib/india/validators";

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
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[6-9]\d{9}$/.test(v), "must be a 10-digit mobile number")
    .optional()
    .nullable(),
  email: z.email("that email is not valid").optional().nullable().or(z.literal("")),
  party_role: z.enum(["consignor", "consignee", "both"]).default("both"),
  addresses: z.array(addressSchema).max(5).default([]),
  notes: z.string().max(1000).optional().nullable(),
});

export type PartyInput = z.infer<typeof partySchema>;

export const VEHICLE_TYPES = [
  "32ft SXL", "32ft MXL", "22ft", "19ft Open", "24ft",
  "Trailer 40ft", "Tanker", "Container 20ft", "Tipper", "Other",
] as const;

const expiry = z.iso.date("use a valid date").optional().nullable().or(z.literal(""));

export const vehicleSchema = z.object({
  reg_number: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isValidRegNumber, "not a valid registration, e.g. KA-01-AB-1234"),
  vehicle_type: z.string().min(1, "pick a vehicle type").max(60),
  capacity_tons: z.number().min(0).max(100).optional().nullable(),
  ownership: z.enum(["own", "attached"]).default("own"),
  rc_expiry: expiry,
  fitness_expiry: expiry,
  insurance_expiry: expiry,
  permit_expiry: expiry,
  puc_expiry: expiry,
});

export type VehicleInput = z.infer<typeof vehicleSchema>;

export const driverSchema = z.object({
  full_name: z.string().min(2, "name is required").max(120),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, "must be a 10-digit mobile number"),
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
