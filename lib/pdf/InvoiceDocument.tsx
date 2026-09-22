import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { RCM_NOTE, EXEMPT_NOTE } from "@/lib/tax";
import { PdfMark } from "./PdfMark";

export interface InvoicePdfData {
  bill_no: string;
  bill_date: string;
  org: { legal_name: string; gstin: string | null; transin: string | null; address: string | null };
  bank: Record<string, string> | null;
  party: { name?: string; gstin?: string; addresses?: { line1?: string; city?: string; pincode?: string }[] };
  lines: { lr_no: string; lr_date: string; route: string; amount: number }[];
  taxable_value: number;
  cgst_amount: number; sgst_amount: number; igst_amount: number;
  total_amount: number; tax_rate_pct: number;
  tax_reason: "rcm" | "exempt" | "intra_state" | "inter_state";
  notes: string | null;
}

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

const date = (d: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(d)).replace(/\//g, "-");

const s = StyleSheet.create({
  page: { fontFamily: "Inter", fontSize: 9, padding: 28, color: "#0A0A0A" },
  orgName: { fontSize: 15, fontWeight: 600 },
  muted: { color: "#525252" },
  title: { textAlign: "center", fontSize: 12, fontWeight: 600, letterSpacing: 1, marginVertical: 10 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 10 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#0A0A0A", paddingBottom: 3, fontWeight: 600 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#E5E5E5", paddingVertical: 3 },
  cLr: { width: "22%", fontFamily: "Mono" },
  cDate: { width: "16%" },
  cRoute: { width: "42%" },
  cAmt: { width: "20%", textAlign: "right", fontFamily: "Mono" },
  totals: { marginTop: 8, marginLeft: "auto", width: "48%" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  grand: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: "#0A0A0A", marginTop: 3, paddingTop: 3, fontWeight: 600 },
  note: { marginTop: 10, fontSize: 8, color: "#525252" },
  bank: { marginTop: 14, fontSize: 8, color: "#525252", lineHeight: 1.4 },
  sign: { marginTop: 26, width: 150, marginLeft: "auto", borderTopWidth: 1, borderColor: "#0A0A0A", paddingTop: 3, fontSize: 8, textAlign: "center" },
});

export function InvoiceDocument({ bill }: { bill: InvoicePdfData }) {
  const addr = bill.party.addresses?.[0];
  return (
    <Document title={bill.bill_no} author={bill.org.legal_name}>
      <Page size="A4" style={s.page}>
        <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
          <View style={{ marginRight: 6, marginTop: 2 }}>
            <PdfMark size={15} />
          </View>
          <Text style={s.orgName}>{bill.org.legal_name}</Text>
        </View>
        {bill.org.address && <Text style={s.muted}>{bill.org.address}</Text>}
        <Text style={s.muted}>
          {bill.org.gstin ? `GSTIN: ${bill.org.gstin}` : bill.org.transin ? `TRANSIN: ${bill.org.transin}` : ""}
        </Text>

        <Text style={s.title}>FREIGHT BILL</Text>

        <View style={s.metaRow}>
          <View style={{ width: "58%" }}>
            <Text style={s.muted}>Billed to</Text>
            <Text style={{ fontWeight: 600 }}>{bill.party.name}</Text>
            {addr && <Text style={s.muted}>{[addr.line1, addr.city, addr.pincode].filter(Boolean).join(", ")}</Text>}
            {bill.party.gstin && <Text style={s.muted}>GSTIN: {bill.party.gstin}</Text>}
          </View>
          <View style={{ width: "38%" }}>
            <View style={s.row}>
              <Text style={s.muted}>Bill no.</Text>
              <Text style={{ fontFamily: "Mono" }}>{bill.bill_no}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.muted}>Date</Text>
              <Text>{date(bill.bill_date)}</Text>
            </View>
          </View>
        </View>

        <View style={s.th}>
          <Text style={s.cLr}>LR No.</Text>
          <Text style={s.cDate}>Date</Text>
          <Text style={s.cRoute}>Route</Text>
          <Text style={s.cAmt}>Amount</Text>
        </View>
        {bill.lines.map((l) => (
          <View key={l.lr_no} style={s.tr}>
            <Text style={s.cLr}>{l.lr_no}</Text>
            <Text style={s.cDate}>{date(l.lr_date)}</Text>
            <Text style={s.cRoute}>{l.route}</Text>
            <Text style={s.cAmt}>{money(l.amount)}</Text>
          </View>
        ))}

        <View style={s.totals}>
          <View style={s.row}>
            <Text style={s.muted}>Taxable value</Text>
            <Text style={{ fontFamily: "Mono" }}>{money(bill.taxable_value)}</Text>
          </View>

          {bill.tax_reason === "inter_state" && (
            <View style={s.row}>
              <Text style={s.muted}>IGST @ {bill.tax_rate_pct}%</Text>
              <Text style={{ fontFamily: "Mono" }}>{money(bill.igst_amount)}</Text>
            </View>
          )}
          {bill.tax_reason === "intra_state" && (
            <>
              <View style={s.row}>
                <Text style={s.muted}>CGST @ {bill.tax_rate_pct / 2}%</Text>
                <Text style={{ fontFamily: "Mono" }}>{money(bill.cgst_amount)}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.muted}>SGST @ {bill.tax_rate_pct / 2}%</Text>
                <Text style={{ fontFamily: "Mono" }}>{money(bill.sgst_amount)}</Text>
              </View>
            </>
          )}

          <View style={s.grand}>
            <Text>Total</Text>
            <Text style={{ fontFamily: "Mono" }}>Rs. {money(bill.total_amount)}</Text>
          </View>
        </View>

        {bill.tax_reason === "rcm" && <Text style={s.note}>{RCM_NOTE}</Text>}
        {bill.tax_reason === "exempt" && <Text style={s.note}>{EXEMPT_NOTE}</Text>}
        {bill.notes && <Text style={s.note}>{bill.notes}</Text>}

        {/* bank_details defaults to '{}' — an org that never filled it in has a
            truthy but empty object, which used to print this line blank on
            every invoice. account and ifsc are what actually make it payable;
            bank/branch alone are not enough to wire money to. */}
        {bill.bank?.account && bill.bank?.ifsc && (
          <Text style={s.bank}>
            Payment to: {bill.bank.bank} {bill.bank.branch ? `(${bill.bank.branch})` : ""} ·
            A/c {bill.bank.account} · IFSC {bill.bank.ifsc}
          </Text>
        )}

        <Text style={s.sign}>for {bill.org.legal_name}</Text>
      </Page>
    </Document>
  );
}
