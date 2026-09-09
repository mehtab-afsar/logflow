import { z } from "zod";
import { isValidGstin, isValidPan } from "@/lib/india/validators";

/**
 * One schema per write, shared by the wizard/settings forms and the route
 * handlers — same convention as features/masters/schemas/masters.ts.
 */

const stateCode = z.string().regex(/^\d{2}$/, "must be a 2-digit state code");
const docPrefix = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,6}$/, "2 to 6 letters, e.g. LF or INV");

const gstin = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === "" || isValidGstin(v), "that GSTIN is not valid — check the digits")
  .optional()
  .nullable();

const transin = z.string().trim().toUpperCase().max(20).optional().nullable();

const pan = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === "" || isValidPan(v), "not a valid PAN, e.g. AAACA1234F")
  .optional()
  .nullable();

/** organisation identity fields, reused by both onboarding and Settings. */
const organisationFields = z.object({
  legal_name: z.string().min(2, "company name is required").max(200),
  gstin,
  transin,
  pan,
  state_code: stateCode,
  address: z.string().max(500).optional().nullable(),
});

const hasIdentity = (v: { gstin?: string | null; transin?: string | null }) =>
  Boolean(v.gstin) || Boolean(v.transin);
const IDENTITY_ISSUE = {
  message: "enter a GSTIN, or a TRANSIN if you are not GST registered",
  path: ["gstin"] as string[],
};

// IFSC: 4-letter bank code, a literal '0' (reserved for future use), 6
// alphanumeric branch code — e.g. HDFC0001234. Checked only when present:
// bank details are optional, and a half-filled form should not block saving
// the fields it does have.
const ifsc = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === "" || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v), "not a valid IFSC, e.g. HDFC0001234")
  .optional();

/** PATCH /api/organisations. Identity fields plus the two the onboarding
 *  wizard collects but Settings could not edit until now: risk_clause is
 *  printed on every LR footer, bank details on every invoice.
 *
 *  Bank details are four FLAT fields here, not one nested object, even
 *  though they land in one jsonb column — parseBody's error path becomes
 *  "fieldname: message", and RecordSheet matches that against a flat form
 *  field by name to highlight it inline. A nested "bank_details.ifsc" path
 *  would match no field on the form and the error would render nowhere at
 *  all, not even as a generic banner. The route assembles the jsonb object
 *  from these four before writing. */
export const organisationProfileSchema = organisationFields
  .extend({
    // No CHECK constraint on this column — it is printed verbatim, not
    // branched on in code, so any short descriptive text is valid. Matches
    // firstBranchSchema's risk_clause exactly; kept optional here so editing
    // only the address, say, does not require retyping it.
    risk_clause: z.string().min(1).max(200).optional(),
    bank_name: z.string().trim().max(120).optional(),
    bank_branch: z.string().trim().max(120).optional(),
    bank_account: z.string().trim().max(30).optional(),
    bank_ifsc: ifsc,
  })
  .refine(hasIdentity, IDENTITY_ISSUE);

export type OrganisationProfileInput = z.infer<typeof organisationProfileSchema>;

export const taxModeSchema = z.object({
  tax_mode: z.enum(["rcm", "fcm_5", "fcm_18"]),
});

export type TaxModeInput = z.infer<typeof taxModeSchema>;

/** The org's first branch, asked during onboarding step 3. */
export const firstBranchSchema = z.object({
  branch_name: z.string().min(1, "branch name is required").max(120),
  branch_city: z.string().max(120).optional().nullable(),
  lr_prefix: docPrefix,
  inv_prefix: docPrefix,
  // No CHECK constraint on this column — it is printed verbatim on the LR
  // footer, not branched on in code, so any short descriptive text is valid.
  risk_clause: z.string().min(1).max(200),
  // 0 = start a fresh sequence. A transporter continuing a paper book enters
  // the next number they would have written by hand.
  lr_starting_number: z.number().int().min(0).max(999_999).default(0),
  inv_starting_number: z.number().int().min(0).max(999_999).default(0),
});

export type FirstBranchInput = z.infer<typeof firstBranchSchema>;

/** POST /api/organisations — everything create_organisation() needs. */
export const createOrganisationSchema = organisationFields
  .extend({ tax_mode: taxModeSchema.shape.tax_mode })
  .extend(firstBranchSchema.shape)
  .refine(hasIdentity, IDENTITY_ISSUE);

export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;

/** A branch added later, from Settings. Same shape, without starting numbers
 *  hidden behind "advanced" — a second branch is rarely a paper-book handoff. */
export const branchCreateSchema = z.object({
  name: z.string().min(1, "branch name is required").max(120),
  city: z.string().max(120).optional().nullable(),
  state_code: stateCode.optional().nullable(),
  lr_prefix: docPrefix,
  inv_prefix: docPrefix,
  lr_starting_number: z.number().int().min(0).max(999_999).default(0),
  inv_starting_number: z.number().int().min(0).max(999_999).default(0),
});

export type BranchCreateInput = z.infer<typeof branchCreateSchema>;

/** Editing an existing branch. Prefixes are handled separately by the route,
 *  which rejects the change once the branch has issued a document — see
 *  app/api/organisations/branches/[id]/route.ts. */
export const branchUpdateSchema = z.object({
  name: z.string().min(1, "branch name is required").max(120).optional(),
  city: z.string().max(120).optional().nullable(),
  state_code: stateCode.optional().nullable(),
  is_active: z.boolean().optional(),
  lr_prefix: docPrefix.optional(),
  inv_prefix: docPrefix.optional(),
});

export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;

export const inviteSchema = z.object({
  email: z.email("that email is not valid").trim().toLowerCase(),
  role: z.enum(["dispatcher", "accounts", "viewer"]),
});

export type InviteInput = z.infer<typeof inviteSchema>;

export const memberRoleSchema = z.object({
  role: z.enum(["owner", "dispatcher", "accounts", "viewer"]),
});

export type MemberRoleInput = z.infer<typeof memberRoleSchema>;

export const emailOnlySchema = z.object({
  email: z.email("that email is not valid").trim().toLowerCase(),
});

/** PATCH /api/profiles/home-branch. Null clears it — back to branches[0]. */
export const homeBranchSchema = z.object({
  branch_id: z.uuid().nullable(),
});

export type HomeBranchInput = z.infer<typeof homeBranchSchema>;
