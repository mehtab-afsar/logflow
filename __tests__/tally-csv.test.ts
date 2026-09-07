import { toTallyCsv, type TallyRow } from "@/lib/billing/tally-csv";

const row = (over: Partial<TallyRow> = {}): TallyRow => ({
  date: "05-09-2026",
  voucherType: "Sales",
  voucherNo: "INV-2627-000001",
  partyLedger: "Apex Polymers Pvt Ltd",
  ledger: "Freight Income",
  amount: 42000,
  cgst: 1050,
  sgst: 1050,
  igst: 0,
  narration: "LF-2627-000412 Bengaluru to Sri City",
  ...over,
});

describe("Tally CSV", () => {
  it("starts with a UTF-8 BOM — without it Tally on Windows mangles non-ASCII", () => {
    expect(toTallyCsv([row()]).charCodeAt(0)).toBe(0xfeff);
  });

  it("uses CRLF line endings — Tally reads a bare LF file as one row", () => {
    const csv = toTallyCsv([row(), row()]);
    expect(csv).toContain("\r\n");
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(3); // header + 2
  });

  it("emits the expected header order", () => {
    const header = toTallyCsv([]).replace(/^﻿/, "").split("\r\n")[0];
    expect(header).toBe(
      "Date,Voucher Type,Voucher No,Party Ledger,Ledger,Amount,CGST,SGST,IGST,Narration",
    );
  });

  it("quotes a party name containing a comma", () => {
    const csv = toTallyCsv([row({ partyLedger: "Apex Polymers, Bengaluru" })]);
    expect(csv).toContain('"Apex Polymers, Bengaluru"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    const csv = toTallyCsv([row({ narration: 'Marked "fragile"' })]);
    expect(csv).toContain('"Marked ""fragile"""');
  });

  it("formats every money column to two decimals", () => {
    const csv = toTallyCsv([row({ amount: 42000, cgst: 1050.5 })]);
    expect(csv).toContain("42000.00");
    expect(csv).toContain("1050.50");
  });

  it("handles an empty bill without throwing", () => {
    expect(() => toTallyCsv([])).not.toThrow();
  });
});
