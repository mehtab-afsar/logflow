import { toPaise, fromPaise, addPaise, formatINR, assertPaise } from "@/lib/money";

describe("paise conversion", () => {
  it("survives the classic float error", () => {
    expect(0.1 + 0.2).not.toBe(0.3);          // the reason this module exists
    expect(toPaise(0.1 + 0.2)).toBe(30);      // not 30.000000000000004
  });

  it.each([
    [0, 0], [1, 100], [19.99, 1999], [1234567.89, 123456789], [0.005, 1],
  ])("₹%s → %i paise", (rupees, paise) => {
    expect(toPaise(rupees)).toBe(paise);
  });

  it("round-trips", () => {
    for (const r of [0, 1, 19.99, 42000, 1234567.89]) {
      expect(fromPaise(toPaise(r))).toBeCloseTo(r, 2);
    }
  });

  it("rejects non-finite input", () => {
    expect(() => toPaise(NaN)).toThrow(/finite/);
    expect(() => toPaise(Infinity)).toThrow(/finite/);
  });
});

describe("assertPaise", () => {
  it("catches float rupees passed where paise were expected", () => {
    expect(() => assertPaise(42.5)).toThrow(/integer paise/i);
    expect(() => assertPaise(4250)).not.toThrow();
  });
});

describe("addPaise", () => {
  it("sums exactly, with no drift across many additions", () => {
    const ten = Array.from({ length: 10 }, () => toPaise(0.1));
    expect(addPaise(...ten)).toBe(100);       // exactly ₹1.00
  });

  it("refuses to add a non-integer", () => {
    expect(() => addPaise(100, 50.5)).toThrow(/integer paise/i);
  });
});

describe("formatINR — Indian digit grouping", () => {
  it.each([
    [toPaise(1234567.89), "12,34,567.89"],   // lakh grouping, not 1,234,567
    [toPaise(100000), "1,00,000.00"],
    [toPaise(999), "999.00"],
    [toPaise(42000), "42,000.00"],
    [0, "0.00"],
  ])("%i paise → ₹%s", (paise, expected) => {
    expect(formatINR(paise, { symbol: false })).toBe(expected);
  });

  it("includes the rupee symbol by default", () => {
    expect(formatINR(toPaise(42000))).toContain("₹");
  });

  it("rejects a non-integer amount", () => {
    expect(() => formatINR(42.5)).toThrow(/integer paise/i);
  });
});
