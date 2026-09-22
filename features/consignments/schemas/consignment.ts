import { z } from "zod";
import { STATUSES } from "@/lib/consignments/state-machine";

const stateCode = z.string().regex(/^\d{2}$/, "must be a 2-digit state code");
const money = z.number().min(0, "cannot be negative").max(99_999_999);

/**
 * One line of the repeatable charges editor. Replaces the 4 fixed
 * freight/loading/unloading/detention columns — see
 * supabase/migrations/20260915000001_charge_types_and_lines.sql. taxable_value
 * is the sum of amount where billable_to_consignor, computed here (client and
 * route agree) rather than trusted from the client alone.
 */
export const chargeLineInputSchema = z.object({
  charge_type_id: z.string().uuid(),
  description: z.string().max(200).optional().nullable(),
  amount: money,
  billable_to_consignor: z.boolean().default(true),
  billable_to_vendor: z.boolean().default(false),
});

export type ChargeLineInput = z.infer<typeof chargeLineInputSchema>;

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
  // Set only when reconciling a blank paper form: the LR number was already
  // printed and handed out before this record existed. See
  // complete_blank_lr_reservation() and assign_lr_number()'s hardening —
  // the database, not just this schema, is what actually enforces that a
  // reservation_id here must be genuinely claimed and match the number used.
  reservation_id: z.string().uuid().optional(),

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
  // charge_lines is the single source of taxable_value going forward — see
  // the migration note above. At least one line, so an LR is never created
  // with zero freight information at all.
  charge_lines: z.array(chargeLineInputSchema).min(1, "add at least one charge line"),

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
  // "Delivered, but the driver phoned it in and the signed paper hasn't
  // reached the office yet" — a real, honest state distinct from "delivered"
  // that today's office UI already lets a dispatcher fake with a bare
  // force:true click, with no record of *why* there's no POD. Deliberately
  // not a new consignments.status: these two keys are annotations on an
  // ordinary status_change event (transition_consignment already writes
  // whatever payload it's given, unchanged — see the route), not a new
  // lifecycle stage that every status-aware consumer would need to learn.
  reported_via: z.enum(["phone"]).optional(),
  pod_pending: z.boolean().optional(),
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
