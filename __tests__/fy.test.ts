import { financialYearCode, financialYearLabel } from "@/lib/india/fy";

describe("financialYearCode — Indian FY runs 1 April to 31 March", () => {
  it.each([
    ["2026-09-07", "2627"],  // mid-year
    ["2026-04-01", "2627"],  // first day of the FY
    ["2027-03-31", "2627"],  // last day of the FY
    ["2027-04-01", "2728"],  // rolls over
    ["2026-03-31", "2526"],  // day before our reference FY starts
    ["2024-02-29", "2324"],  // leap day
    ["1999-12-31", "9900"],  // century wrap is intentional
    ["2000-01-01", "9900"],
  ])("%s → %s", (iso, expected) => {
    const [y, m, d] = iso.split("-").map(Number);
    expect(financialYearCode(new Date(y, m - 1, d))).toBe(expected);
  });

  it("is stable across the 31 March / 1 April boundary", () => {
    expect(financialYearCode(new Date(2027, 2, 31))).toBe("2627"); // 31 Mar
    expect(financialYearCode(new Date(2027, 3, 1))).toBe("2728");  // 1 Apr
  });
});

describe("financialYearLabel", () => {
  it.each([
    ["2627", "2026-27"],
    ["2425", "2024-25"],
    ["9900", "1999-00"],
  ])("%s → %s", (code, label) => {
    expect(financialYearLabel(code)).toBe(label);
  });

  it("rejects a malformed code", () => {
    expect(() => financialYearLabel("26")).toThrow();
  });
});
