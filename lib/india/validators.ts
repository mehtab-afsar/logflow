/**
 * Format validators for Indian statutory identifiers.
 *
 * These run client-side on the LR form and server-side in the Zod schemas.
 * The database enforces the same shapes as CHECK constraints (migration 03);
 * the checksum below is the part SQL cannot express.
 */

const GSTIN_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * GSTIN mod-36 check digit.
 *
 * Positions 1..14 are weighted alternately 1 and 2. For each, the product is
 * folded as floor(p/36) + (p%36); the 15th character is the value that brings
 * the running sum to a multiple of 36.
 */
export function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const value = GSTIN_CHARSET.indexOf(first14[i]);
    if (value < 0) throw new Error(`gstinCheckDigit: invalid character '${first14[i]}'`);
    const factor = i % 2 === 0 ? 1 : 2;
    const product = value * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARSET[(36 - (sum % 36)) % 36];
}

/** Shape AND checksum. A shape-only check accepts typos that GST portals reject. */
export function isValidGstin(gstin: string): boolean {
  if (typeof gstin !== "string") return false;
  const value = gstin.trim().toUpperCase();
  if (!GSTIN_SHAPE.test(value)) return false;
  return gstinCheckDigit(value.slice(0, 14)) === value[14];
}

/** First two digits of a GSTIN are the state code. */
export function stateCodeFromGstin(gstin: string): string | null {
  const value = gstin.trim().toUpperCase();
  return GSTIN_SHAPE.test(value) ? value.slice(0, 2) : null;
}

/**
 * Vehicle registration. Two live formats:
 *   standard   KA 01 AB 1234   (state, RTO district, series, number)
 *   BH series  23 BH 1234 AA   (year, 'BH', number, series)
 * Separators are optional and are normalised away.
 */
const RTO_STANDARD = /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/;
const RTO_BH = /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/;

export function normaliseRegNumber(reg: string): string {
  return reg.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function isValidRegNumber(reg: string): boolean {
  if (typeof reg !== "string") return false;
  const n = normaliseRegNumber(reg);
  return RTO_BH.test(n) || RTO_STANDARD.test(n);
}

/** Display form: KA-01-AB-1234. Falls back to the normalised string. */
export function formatRegNumber(reg: string): string {
  const n = normaliseRegNumber(reg);
  const m = /^([A-Z]{2})([0-9]{1,2})([A-Z]{0,3})([0-9]{4})$/.exec(n);
  if (!m) return n;
  return [m[1], m[2], m[3], m[4]].filter(Boolean).join("-");
}

/** 10-digit Indian mobile, no country code. */
export function isValidPhone(phone: string): boolean {
  return typeof phone === "string" && /^[6-9][0-9]{9}$/.test(phone.trim());
}

/** wa.me wants 91 + the 10 digits, no plus, no spaces. */
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "").slice(-10);
  return `91${digits}`;
}

/** Driving licence: 2 letters (state), 2 digits (RTO), then 11 digits. */
export function isValidDlNumber(dl: string): boolean {
  if (typeof dl !== "string") return false;
  return /^[A-Z]{2}[0-9]{2}\s?[0-9]{11}$/.test(dl.trim().toUpperCase());
}

/** 12-digit e-way bill number. */
export function isValidEwbNumber(ewb: string): boolean {
  return typeof ewb === "string" && /^[0-9]{12}$/.test(ewb.trim());
}

export function isValidPincode(pin: string): boolean {
  return typeof pin === "string" && /^[1-9][0-9]{5}$/.test(pin.trim());
}

export function isValidPan(pan: string): boolean {
  return typeof pan === "string" && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.trim().toUpperCase());
}
