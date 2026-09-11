import {
  gstinCheckDigit, isValidGstin, stateCodeFromGstin,
  isValidRegNumber, normaliseRegNumber, formatRegNumber,
  isValidPhone, toWhatsAppNumber, isValidDlNumber, isValidEwbNumber,
  isValidPincode, isValidPan, normaliseIndianPhone,
} from "@/lib/india/validators";

/** Published sample GSTINs — the checksum implementation is pinned to these. */
const VALID_GSTINS = ["27AAPFU0939F1ZV", "24AAACC1206D1ZM"];

describe("GSTIN", () => {
  it.each(VALID_GSTINS)("%s passes shape and checksum", (g) => {
    expect(isValidGstin(g)).toBe(true);
  });

  it.each(VALID_GSTINS)("%s fails when any single character is mutated", (g) => {
    // Mutating the 6th char (part of the PAN block) must break the checksum.
    const mutated = g.slice(0, 5) + (g[5] === "A" ? "B" : "A") + g.slice(6);
    expect(mutated).not.toBe(g);
    expect(isValidGstin(mutated)).toBe(false);
  });

  it("rejects a truncated GSTIN", () => {
    expect(isValidGstin("29AABCS1429B1Z")).toBe(false);
  });

  it("rejects a GSTIN without Z in position 14", () => {
    expect(isValidGstin("27AAPFU0939F1XV")).toBe(false);
  });

  it("is case-insensitive and trims", () => {
    expect(isValidGstin("  27aapfu0939f1zv  ")).toBe(true);
  });

  it("derives the state code from the first two digits", () => {
    expect(stateCodeFromGstin("27AAPFU0939F1ZV")).toBe("27");
    expect(stateCodeFromGstin("not-a-gstin")).toBeNull();
  });

  it("check digit is a single character from the mod-36 alphabet", () => {
    const d = gstinCheckDigit("27AAPFU0939F1Z");
    expect(d).toHaveLength(1);
    expect("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ").toContain(d);
  });

  it("rejects a short input rather than silently computing from undefined", () => {
    expect(() => gstinCheckDigit("27AAPFU0939F1")).toThrow(/invalid character/i);
  });
});

describe("vehicle registration", () => {
  it.each([
    "KA01AB1234", "KA-01-AB-1234", "KA 01 AB 1234",
    "DL1CA5678", "MH12DE1433", "TN10Y1234",
  ])("accepts standard format %s", (r) => {
    expect(isValidRegNumber(r)).toBe(true);
  });

  it.each(["23BH1234AA", "22-BH-9999-A"])("accepts BH series %s", (r) => {
    expect(isValidRegNumber(r)).toBe(true);
  });

  it.each(["XX99ZZ99999", "1234", "", "KA01AB123"])("rejects %s", (r) => {
    expect(isValidRegNumber(r)).toBe(false);
  });

  it("normalises separators and case", () => {
    expect(normaliseRegNumber("ka-01 ab_1234")).toBe("KA01AB1234");
  });

  it("formats to the dashed display form", () => {
    expect(formatRegNumber("KA01AB1234")).toBe("KA-01-AB-1234");
    expect(formatRegNumber("ka 51 ab 4471")).toBe("KA-51-AB-4471");
  });

  it("two spellings of one number normalise identically (the uniqueness guarantee)", () => {
    expect(normaliseRegNumber("KA 01 AB 1234")).toBe(normaliseRegNumber("ka-01-ab-1234"));
  });
});

describe("phone", () => {
  it.each(["9876543210", "6000000000", "7412589630"])("accepts %s", (p) => {
    expect(isValidPhone(p)).toBe(true);
  });
  it.each(["5876543210", "987654321", "98765432101", "+919876543210"])("rejects %s", (p) => {
    expect(isValidPhone(p)).toBe(false);
  });
  it("builds a wa.me number", () => {
    expect(toWhatsAppNumber("98765 43210")).toBe("919876543210");
    expect(toWhatsAppNumber("+91 98765 43210")).toBe("919876543210");
  });
});

/**
 * Found by reproducing a real "cannot add a party" report: the party and
 * driver forms both validated with a bare 10-digit regex against whatever a
 * person actually typed, including a mid-number space or a +91 a phone's own
 * contacts app suggests. Pinned here because every phone field in the
 * product now routes through this first.
 */
describe("normaliseIndianPhone", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["98765 43210", "9876543210"],
    ["+91 98765 43210", "9876543210"],
    ["+919876543210", "9876543210"],
    ["919876543210", "9876543210"],
    ["09876543210", "9876543210"],
    ["98765-43210", "9876543210"],
  ])("%s → %s", (raw, expected) => {
    expect(normaliseIndianPhone(raw)).toBe(expected);
    expect(isValidPhone(normaliseIndianPhone(raw))).toBe(true);
  });

  it("does not mangle a number that is already clean", () => {
    expect(normaliseIndianPhone("6000000000")).toBe("6000000000");
  });

  it("leaves a genuinely malformed number invalid rather than guessing", () => {
    // 8 digits — not a truncated country code or a leading zero, just wrong.
    expect(isValidPhone(normaliseIndianPhone("98765432"))).toBe(false);
  });
});

describe("other identifiers", () => {
  it("driving licence", () => {
    expect(isValidDlNumber("KA05 20180001234")).toBe(true);
    expect(isValidDlNumber("KA0520180001234")).toBe(true);
    expect(isValidDlNumber("K5 20180001234")).toBe(false);
  });
  it("e-way bill is exactly 12 digits", () => {
    expect(isValidEwbNumber("341267890123")).toBe(true);
    expect(isValidEwbNumber("34126789012")).toBe(false);
    expect(isValidEwbNumber("3412678901234")).toBe(false);
    expect(isValidEwbNumber("34126789012A")).toBe(false);
  });
  it("pincode", () => {
    expect(isValidPincode("560058")).toBe(true);
    expect(isValidPincode("060058")).toBe(false);
  });
  it("PAN", () => {
    expect(isValidPan("AAPFU0939F")).toBe(true);
    expect(isValidPan("AAPFU0939")).toBe(false);
  });
});
