/**
 * Tally voucher-import CSV.
 *
 * Two details that are not cosmetic:
 *   · CRLF line endings — Tally on Windows treats a bare LF file as one row.
 *   · a UTF-8 BOM — without it Tally mangles the rupee sign and any non-ASCII
 *     party name.
 */
export interface TallyRow {
  date: string;            // DD-MM-YYYY
  voucherType: string;
  voucherNo: string;
  partyLedger: string;
  ledger: string;
  amount: number;
  cgst: number;
  sgst: number;
  igst: number;
  narration: string;
}

const HEADERS = [
  "Date", "Voucher Type", "Voucher No", "Party Ledger", "Ledger",
  "Amount", "CGST", "SGST", "IGST", "Narration",
] as const;

/** RFC4180 quoting: wrap when the value contains a comma, quote or newline. */
function cell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toTallyCsv(rows: TallyRow[]): string {
  const lines = [
    HEADERS.join(","),
    ...rows.map((r) =>
      [
        r.date, r.voucherType, r.voucherNo, r.partyLedger, r.ledger,
        r.amount.toFixed(2), r.cgst.toFixed(2), r.sgst.toFixed(2), r.igst.toFixed(2),
        r.narration,
      ].map(cell).join(","),
    ),
  ];
  return `﻿${lines.join("\r\n")}\r\n`;
}
