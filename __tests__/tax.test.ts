import { computeTax, RCM_NOTE, EXEMPT_NOTE, type TaxMode, type TaxInput } from "@/lib/tax";
import { toPaise } from "@/lib/money";

const KA = "29";
const MH = "27";

function input(over: Partial<TaxInput> = {}): TaxInput {
  return {
    taxableValuePaise: toPaise(1000),
    mode: "fcm_5",
    supplierStateCode: KA,
    placeOfSupplyStateCode: KA,
    exemptGoods: false,
    ...over,
  };
}

const ALL_MODES: TaxMode[] = ["rcm", "fcm_5", "fcm_18"];

describe("computeTax — reverse charge", () => {
  it.each([
    ["intra-state", KA],
    ["inter-state", MH],
  ])("1-2. rcm %s charges nothing and prints the statutory note", (_label, pos) => {
    const r = computeTax(input({ mode: "rcm", placeOfSupplyStateCode: pos }));
    expect(r.totalTaxPaise).toBe(0);
    expect(r.cgstPaise + r.sgstPaise + r.igstPaise).toBe(0);
    expect(r.reason).toBe("rcm");
    expect(r.note).toBe(RCM_NOTE);
    expect(r.ratePct).toBe(0);
  });

  it.each([
    ["intra-state", KA],
    ["inter-state", MH],
  ])("3-4. rcm + exempt %s prints NO rcm note (no liability to shift)", (_label, pos) => {
    const r = computeTax(input({ mode: "rcm", placeOfSupplyStateCode: pos, exemptGoods: true }));
    expect(r.totalTaxPaise).toBe(0);
    expect(r.reason).toBe("exempt");
    expect(r.note).toBe(EXEMPT_NOTE);
    expect(r.note).not.toBe(RCM_NOTE);
  });
});

describe("computeTax — forward charge", () => {
  it("5. fcm_5 intra-state splits 2.5% + 2.5%", () => {
    const r = computeTax(input({ mode: "fcm_5" }));
    expect(r.cgstPaise).toBe(toPaise(25));
    expect(r.sgstPaise).toBe(toPaise(25));
    expect(r.igstPaise).toBe(0);
    expect(r.reason).toBe("intra_state");
    expect(r.invoiceTotalPaise).toBe(toPaise(1050));
  });

  it("6. fcm_5 inter-state is a single 5% IGST line", () => {
    const r = computeTax(input({ mode: "fcm_5", placeOfSupplyStateCode: MH }));
    expect(r.igstPaise).toBe(toPaise(50));
    expect(r.cgstPaise).toBe(0);
    expect(r.sgstPaise).toBe(0);
    expect(r.reason).toBe("inter_state");
  });

  it.each([
    ["intra", KA],
    ["inter", MH],
  ])("7-8. fcm_5 %s-state with exempt goods charges nothing", (_l, pos) => {
    const r = computeTax(input({ mode: "fcm_5", placeOfSupplyStateCode: pos, exemptGoods: true }));
    expect(r.totalTaxPaise).toBe(0);
    expect(r.reason).toBe("exempt");
  });

  it("9. fcm_18 intra-state splits 9% + 9%", () => {
    const r = computeTax(input({ mode: "fcm_18" }));
    expect(r.cgstPaise).toBe(toPaise(90));
    expect(r.sgstPaise).toBe(toPaise(90));
    expect(r.igstPaise).toBe(0);
  });

  it("10. fcm_18 inter-state is a single 18% IGST line", () => {
    const r = computeTax(input({ mode: "fcm_18", placeOfSupplyStateCode: MH }));
    expect(r.igstPaise).toBe(toPaise(180));
    expect(r.cgstPaise).toBe(0);
  });

  it.each([
    ["intra", KA],
    ["inter", MH],
  ])("11-12. fcm_18 %s-state with exempt goods charges nothing", (_l, pos) => {
    const r = computeTax(input({ mode: "fcm_18", placeOfSupplyStateCode: pos, exemptGoods: true }));
    expect(r.totalTaxPaise).toBe(0);
  });
});

describe("computeTax — rounding", () => {
  it("13. CGST and SGST round independently; sum may differ from IGST by 1 paisa", () => {
    // 100003 paise @ 5% = 5000.15 paise. Split: round(2500.075) = 2500 each.
    const intra = computeTax(input({ taxableValuePaise: 100003, mode: "fcm_5" }));
    const inter = computeTax(input({ taxableValuePaise: 100003, mode: "fcm_5", placeOfSupplyStateCode: MH }));
    expect(intra.cgstPaise).toBe(2500);
    expect(intra.sgstPaise).toBe(2500);
    expect(intra.totalTaxPaise).toBe(5000);
    expect(inter.igstPaise).toBe(5000);
    expect(Math.abs(intra.totalTaxPaise - inter.igstPaise)).toBeLessThanOrEqual(1);
  });

  it("14. a 1-paisa taxable value rounds each half to zero", () => {
    const r = computeTax(input({ taxableValuePaise: 1, mode: "fcm_18" }));
    expect(r.cgstPaise).toBe(0);
    expect(r.sgstPaise).toBe(0);
    expect(r.invoiceTotalPaise).toBe(1);
  });

  it("15. a zero taxable value is legal and taxes to zero", () => {
    const r = computeTax(input({ taxableValuePaise: 0, mode: "fcm_18" }));
    expect(r.totalTaxPaise).toBe(0);
    expect(r.invoiceTotalPaise).toBe(0);
  });

  it("23. a large value stays exact in paise", () => {
    const r = computeTax(input({ taxableValuePaise: toPaise(1234567.89), mode: "fcm_5" }));
    expect(r.taxableValuePaise).toBe(123456789);
    expect(r.cgstPaise).toBe(3086420); // round(123456789 * 5 / 200)
    expect(r.sgstPaise).toBe(3086420);
    expect(r.invoiceTotalPaise).toBe(123456789 + 6172840);
  });
});

describe("computeTax — guards", () => {
  it("16. rejects a negative taxable value", () => {
    expect(() => computeTax(input({ taxableValuePaise: -1 }))).toThrow(/negative/i);
  });

  it("16b. rejects a non-integer taxable value (float rupees passed by mistake)", () => {
    expect(() => computeTax(input({ taxableValuePaise: 100.5 }))).toThrow(/integer paise/i);
  });

  it.each([
    ["supplier", { supplierStateCode: "2" }],
    ["place of supply", { placeOfSupplyStateCode: "298" }],
    ["non-numeric", { supplierStateCode: "KA" }],
  ])("17. rejects a malformed %s state code", (_l, over) => {
    expect(() => computeTax(input(over))).toThrow(/state code/i);
  });
});

describe("computeTax — state comparison", () => {
  it("18. same state code is intra-state", () => {
    expect(computeTax(input({ supplierStateCode: KA, placeOfSupplyStateCode: KA })).isInterState).toBe(false);
  });
  it("19. different state codes are inter-state", () => {
    expect(computeTax(input({ supplierStateCode: KA, placeOfSupplyStateCode: MH })).isInterState).toBe(true);
  });
});

describe("computeTax — invariants across every mode", () => {
  const cases = ALL_MODES.flatMap((mode) =>
    [KA, MH].flatMap((pos) =>
      [false, true].map((exemptGoods) => ({ mode, pos, exemptGoods })),
    ),
  );

  it.each(cases)("20. invoiceTotal === taxable + cgst + sgst + igst ($mode, $pos, exempt=$exemptGoods)", (c) => {
    const r = computeTax(input({ mode: c.mode, placeOfSupplyStateCode: c.pos, exemptGoods: c.exemptGoods }));
    expect(r.invoiceTotalPaise).toBe(r.taxableValuePaise + r.cgstPaise + r.sgstPaise + r.igstPaise);
    expect(r.totalTaxPaise).toBe(r.cgstPaise + r.sgstPaise + r.igstPaise);
  });

  it.each(cases)("21. IGST and CGST are never both present ($mode, $pos, exempt=$exemptGoods)", (c) => {
    const r = computeTax(input({ mode: c.mode, placeOfSupplyStateCode: c.pos, exemptGoods: c.exemptGoods }));
    expect(r.igstPaise > 0 && r.cgstPaise > 0).toBe(false);
    // And an intra-state split is always symmetric.
    expect(r.cgstPaise).toBe(r.sgstPaise);
  });
});

describe("computeTax — contract", () => {
  it("22. the RCM note is byte-exact (it is printed on statutory paper)", () => {
    expect(RCM_NOTE).toBe(
      "GST payable by recipient under reverse charge (Notification 13/2017-CT(R))",
    );
  });

  it("24. is referentially transparent and does not mutate its input", () => {
    const arg = input({ mode: "fcm_18", placeOfSupplyStateCode: MH });
    const snapshot = JSON.parse(JSON.stringify(arg));
    const a = computeTax(arg);
    const b = computeTax(arg);
    expect(a).toEqual(b);
    expect(arg).toEqual(snapshot);
  });
});
