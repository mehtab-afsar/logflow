import { z } from "zod";
import { STATUSES } from "@/lib/consignments/state-machine";

const stateCode = z.string().regex(/^\d{2}$/, "must be a 2-digit state code");
const money = z.number().min(0, "cannot be negative").max(99_999_999);

/** The address block frozen onto the LR at issue time. */
export const partySnapshotSchema = z.object({
  name: z.string().min(1, "name is required").max(200),
  gstin: z.string().max(15).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state_code: stateCode.optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
});

export const createConsignmentSchema = z.object({
  branch_id: z.string().uuid(),
  lr_date: z.iso.date().optional(),

  consignor_party_id: z.string().uuid(),
  consignee_party_id: z.string().uuid(),

  origin_city: z.string().min(1, "origin city is required").max(120),
  origin_state: stateCode,
  destination_city: z.string().min(1, "destination city is required").max(120),
  destination_state: stateCode,
  distance_km: z.number().int().min(0).max(10_000).optional().nullable(),

  cargo_description: z.string().min(1, "describe the cargo").max(500),
  packages_count: z.number().int().min(1, "at least one package").max(100_000).default(1),
  packages_unit: z.string().max(20).default("pkgs"),
  actual_weight_kg: z.number().min(0).max(100_000).optional().nullable(),
  charged_weight_kg: z.number().min(0).max(100_000).optional().nullable(),
  declared_value: money.default(0),
  hsn_code: z.string().max(10).optional().nullable(),

  customer_invoice_no: z.string().max(60).optional().nullable(),
  customer_invoice_date: z.iso.date().optional().nullable(),
  ewb_no: z.string().regex(/^\d{12}$/, "e-way bill number must be exactly 12 digits")
           .optional().nullable().or(z.literal("")),

  freight_basis: z.enum(["per_trip", "per_ton"]).default("per_trip"),
  freight_rate: money.optional().nullable(),
  freight: money.default(0),
  loading: money.default(0),
  unloading: money.default(0),
  detention: money.default(0),
  other_charges: money.default(0),

  exempt_goods: z.boolean().default(false),
  freight_terms: z.enum(["paid", "to_pay", "to_be_billed"]).default("to_be_billed"),
  advance_received: money.default(0),

  vehicle_id: z.string().uuid().optional().nullable(),
  driver_id: z.string().uuid().optional().nullable(),
  delivery_instructions: z.string().max(1000).optional().nullable(),
  remarks: z.string().max(1000).optional().nullable(),
  eta_text: z.string().max(200).optional().nullable(),
});

export type CreateConsignmentInput = z.infer<typeof createConsignmentSchema>;

export const transitionSchema = z.object({
  to_status: z.enum(STATUSES),
  reason: z.string().max(500).optional(),
  remarks: z.string().max(500).optional(),
  location: z.string().max(200).optional(),
  advance: z.number().min(0).max(9_999_999).optional(),
  force: z.boolean().optional(),
  event_time: z.iso.datetime().optional(),
});

export const registerFilterSchema = z.object({
  status: z.enum(STATUSES).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  party: z.string().uuid().optional(),
  vehicle: z.string().uuid().optional(),
  driver: z.string().uuid().optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});
