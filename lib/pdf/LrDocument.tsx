import {
  Document, Image, Page, StyleSheet, Text, View,
} from "@react-pdf/renderer";
import { RCM_NOTE, EXEMPT_NOTE } from "@/lib/tax";

/**
 * The printed lorry receipt.
 *
 * The layout deliberately mirrors the paper LR book a transporter has used for
 * twenty years — same field order, same blocks — so nobody has to hunt for
 * anything. It is cleaner, not different.
 *
 * ENGLISH ONLY, by decision: @react-pdf has no HarfBuzz, so it performs no
 * complex-script shaping. Devanagari conjuncts and Kannada would render as
 * broken or blank glyphs. The driver-facing web UI is translated instead,
 * where the browser shapes text correctly.
 */

export const COPIES = [
  { key: "consignor", label: "CONSIGNOR COPY" },
  { key: "consignee", label: "CONSIGNEE COPY" },
  { key: "driver", label: "DRIVER COPY" },
  { key: "office", label: "OFFICE COPY" },
] as const;

export type CopyKey = (typeof COPIES)[number]["key"];

export interface LrPdfData {
  lr_no: string;
  lr_date: string;
  org: {
    legal_name: string; gstin: string | null; transin: string | null;
    address: string | null; state_code: string; risk_clause: string;
  };
  branch: { name: string; city: string | null };
  consignor: Record<string, string | null>;
  consignee: Record<string, string | null>;
  origin_city: string; destination_city: string; distance_km: number | null;
  cargo_description: string; packages_count: number; packages_unit: string;
  actual_weight_kg: number | null; charged_weight_kg: number | null;
  declared_value: number; hsn_code: string | null;
  customer_invoice_no: string | null; customer_invoice_date: string | null;
  ewb_no: string | null; ewb_valid_until: string | null;
  freight: number; loading: number; unloading: number; detention: number;
  other_charges: number; taxable_value: number;
  cgst_amount: number; sgst_amount: number; igst_amount: number;
  invoice_total: number; tax_rate_pct: number;
  tax_reason: "rcm" | "exempt" | "intra_state" | "inter_state";
  freight_terms: string; advance_received: number;
  vehicle_no: string | null; driver_name: string | null; driver_phone: string | null;
  delivery_instructions: string | null; remarks: string | null;
}

const FREIGHT_TERMS_LABEL: Record<string, string> = {
  paid: "Paid",
  to_pay: "To Pay",
  to_be_billed: "To Be Billed",
};

function money(n: number): string {
  return new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
}

function date(d: string | null): string {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(parsed).replace(/\//g, "-");
}

function makeStyles(compact: boolean) {
  const base = compact ? 7.5 : 9;
  const pad = compact ? 2.5 : 4;
  return StyleSheet.create({
    page: { fontFamily: "Inter", fontSize: base, padding: compact ? 14 : 22, color: "#0A0A0A" },
    watermark: {
      position: "absolute", top: "42%", left: 0, right: 0, textAlign: "center",
      fontSize: compact ? 34 : 48, color: "#000000", opacity: 0.06, transform: "rotate(-30deg)",
    },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
    orgName: { fontSize: base + 5, fontWeight: 600 },
    muted: { color: "#525252" },
    copyBadge: {
      borderWidth: 1, borderColor: "#0A0A0A", borderRadius: 2,
      paddingVertical: 2, paddingHorizontal: 5, fontSize: base - 1.5, fontWeight: 600,
    },
    title: {
      textAlign: "center", fontSize: base + 3, fontWeight: 600, letterSpacing: 1,
      marginTop: 6, marginBottom: 6,
    },
    box: { borderWidth: 1, borderColor: "#0A0A0A", marginTop: 4 },
    row: { flexDirection: "row" },
    cell: { padding: pad, borderRightWidth: 1, borderColor: "#0A0A0A", flex: 1 },
    cellLast: { padding: pad, flex: 1 },
    rowBorder: { borderBottomWidth: 1, borderColor: "#0A0A0A" },
    label: { color: "#525252", fontSize: base - 1.5, marginBottom: 1 },
    value: { fontSize: base },
    mono: { fontFamily: "Mono", fontSize: base },
    amountRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
    amountLabel: { color: "#525252" },
    amountValue: { fontFamily: "Mono" },
    totalRow: {
      flexDirection: "row", justifyContent: "space-between",
      borderTopWidth: 1, borderColor: "#0A0A0A", marginTop: 3, paddingTop: 3, fontWeight: 600,
    },
    taxNote: { marginTop: 3, fontSize: base - 1.5, color: "#525252" },
    footer: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
    sign: { width: 130, borderTopWidth: 1, borderColor: "#0A0A0A", paddingTop: 3, fontSize: base - 1.5, textAlign: "center" },
    terms: { marginTop: 8, fontSize: base - 2, color: "#525252", lineHeight: 1.35 },
  });
}

function Field({ label, value, s, mono }: { label: string; value: string; s: ReturnType<typeof makeStyles>; mono?: boolean }) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <Text style={mono ? s.mono : s.value}>{value || "—"}</Text>
    </View>
  );
}

function TaxBlock({ lr, s }: { lr: LrPdfData; s: ReturnType<typeof makeStyles> }) {
  // Driven by the reason recorded at issue time, never re-derived here: a
  // historical LR must reprint identically after the org changes tax mode.
  if (lr.tax_reason === "rcm") {
    return <Text style={s.taxNote}>{RCM_NOTE}</Text>;
  }
  if (lr.tax_reason === "exempt") {
    return <Text style={s.taxNote}>{EXEMPT_NOTE}</Text>;
  }
  if (lr.tax_reason === "inter_state") {
    return (
      <View style={s.amountRow}>
        <Text style={s.amountLabel}>IGST @ {lr.tax_rate_pct}%</Text>
        <Text style={s.amountValue}>{money(lr.igst_amount)}</Text>
      </View>
    );
  }
  const half = lr.tax_rate_pct / 2;
  return (
    <View>
      <View style={s.amountRow}>
        <Text style={s.amountLabel}>CGST @ {half}%</Text>
        <Text style={s.amountValue}>{money(lr.cgst_amount)}</Text>
      </View>
      <View style={s.amountRow}>
        <Text style={s.amountLabel}>SGST @ {half}%</Text>
        <Text style={s.amountValue}>{money(lr.sgst_amount)}</Text>
      </View>
    </View>
  );
}

function LrBody({ lr, qr, s, compact }: { lr: LrPdfData; qr: string; s: ReturnType<typeof makeStyles>; compact: boolean }) {
  return (
    <View>
      <View style={s.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.orgName}>{lr.org.legal_name}</Text>
          {lr.org.address && <Text style={s.muted}>{lr.org.address}</Text>}
          <Text style={s.muted}>
            {lr.org.gstin ? `GSTIN: ${lr.org.gstin}` : lr.org.transin ? `TRANSIN: ${lr.org.transin}` : ""}
          </Text>
        </View>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf <Image> is not a DOM img and takes no alt */}
          <Image src={qr} style={{ width: compact ? 44 : 56, height: compact ? 44 : 56 }} />
      </View>

      <Text style={s.title}>LORRY RECEIPT</Text>

      <View style={s.box}>
        <View style={[s.row, s.rowBorder]}>
          <View style={s.cell}><Field s={s} label="LR No." value={lr.lr_no} mono /></View>
          <View style={s.cell}><Field s={s} label="Date" value={date(lr.lr_date)} /></View>
          <View style={s.cellLast}><Field s={s} label="Branch" value={lr.branch.name} /></View>
        </View>

        <View style={[s.row, s.rowBorder]}>
          <View style={s.cell}>
            <Field s={s} label="Consignor" value={String(lr.consignor.name ?? "")} />
            <Text style={s.muted}>{lr.consignor.address ?? ""}</Text>
            {lr.consignor.gstin && <Text style={s.muted}>GSTIN: {lr.consignor.gstin}</Text>}
          </View>
          <View style={s.cellLast}>
            <Field s={s} label="Consignee" value={String(lr.consignee.name ?? "")} />
            <Text style={s.muted}>{lr.consignee.address ?? ""}</Text>
            {lr.consignee.gstin && <Text style={s.muted}>GSTIN: {lr.consignee.gstin}</Text>}
          </View>
        </View>

        <View style={[s.row, s.rowBorder]}>
          <View style={s.cell}><Field s={s} label="From" value={lr.origin_city} /></View>
          <View style={s.cell}><Field s={s} label="To" value={lr.destination_city} /></View>
          <View style={s.cellLast}>
            <Field s={s} label="Distance" value={lr.distance_km ? `${lr.distance_km} km` : "—"} />
          </View>
        </View>

        <View style={[s.row, s.rowBorder]}>
          <View style={s.cell}>
            <Field s={s} label="Description of goods" value={lr.cargo_description} />
          </View>
          <View style={s.cell}>
            <Field s={s} label="Packages" value={`${lr.packages_count} ${lr.packages_unit}`} />
          </View>
          <View style={s.cell}>
            <Field s={s} label="Actual wt." value={lr.actual_weight_kg ? `${lr.actual_weight_kg} kg` : "—"} />
          </View>
          <View style={s.cellLast}>
            <Field s={s} label="Charged wt." value={lr.charged_weight_kg ? `${lr.charged_weight_kg} kg` : "—"} />
          </View>
        </View>

        <View style={[s.row, s.rowBorder]}>
          <View style={s.cell}>
            <Field s={s} label="Invoice no." value={lr.customer_invoice_no ?? "—"} />
          </View>
          <View style={s.cell}>
            <Field s={s} label="Invoice date" value={date(lr.customer_invoice_date)} />
          </View>
          <View style={s.cell}>
            <Field s={s} label="Declared value" value={`Rs. ${money(lr.declared_value)}`} />
          </View>
          <View style={s.cellLast}>
            <Field s={s} label="E-way bill" value={lr.ewb_no ?? "—"} mono />
          </View>
        </View>

        <View style={s.row}>
          <View style={s.cell}>
            <Field s={s} label="Vehicle no." value={lr.vehicle_no ?? "—"} mono />
          </View>
          <View style={s.cell}>
            <Field s={s} label="Driver" value={lr.driver_name ?? "—"} />
          </View>
          <View style={s.cellLast}>
            <Field s={s} label="Freight terms" value={FREIGHT_TERMS_LABEL[lr.freight_terms] ?? lr.freight_terms} />
          </View>
        </View>
      </View>

      {/* Commercials */}
      <View style={[s.box, { padding: compact ? 4 : 6 }]}>
        <View style={s.amountRow}>
          <Text style={s.amountLabel}>Freight</Text>
          <Text style={s.amountValue}>{money(lr.freight)}</Text>
        </View>
        {lr.loading > 0 && (
          <View style={s.amountRow}>
            <Text style={s.amountLabel}>Loading</Text>
            <Text style={s.amountValue}>{money(lr.loading)}</Text>
          </View>
        )}
        {lr.unloading > 0 && (
          <View style={s.amountRow}>
            <Text style={s.amountLabel}>Unloading</Text>
            <Text style={s.amountValue}>{money(lr.unloading)}</Text>
          </View>
        )}
        {lr.detention > 0 && (
          <View style={s.amountRow}>
            <Text style={s.amountLabel}>Detention / halting</Text>
            <Text style={s.amountValue}>{money(lr.detention)}</Text>
          </View>
        )}
        {lr.other_charges > 0 && (
          <View style={s.amountRow}>
            <Text style={s.amountLabel}>Other charges</Text>
            <Text style={s.amountValue}>{money(lr.other_charges)}</Text>
          </View>
        )}

        <View style={[s.amountRow, { borderTopWidth: 1, borderColor: "#E5E5E5", marginTop: 2, paddingTop: 2 }]}>
          <Text style={s.amountLabel}>Taxable value</Text>
          <Text style={s.amountValue}>{money(lr.taxable_value)}</Text>
        </View>

        <TaxBlock lr={lr} s={s} />

        <View style={s.totalRow}>
          <Text>Total</Text>
          <Text style={s.amountValue}>Rs. {money(lr.invoice_total)}</Text>
        </View>

        {lr.advance_received > 0 && (
          <View style={s.amountRow}>
            <Text style={s.amountLabel}>Advance received</Text>
            <Text style={s.amountValue}>{money(lr.advance_received)}</Text>
          </View>
        )}
      </View>

      {!compact && (
        <Text style={s.terms}>
          {lr.org.risk_clause}. Goods are carried subject to the conditions of carriage. The
          consignee must examine the consignment before taking delivery; claims for shortage or
          damage will not be entertained after delivery. Demurrage is chargeable after 24 hours of
          arrival at destination. Subject to {lr.branch.city ?? "local"} jurisdiction.
        </Text>
      )}

      <View style={s.footer}>
        <Text style={s.sign}>Consignor signature</Text>
        <Text style={s.sign}>Driver signature</Text>
        <Text style={s.sign}>for {lr.org.legal_name}</Text>
      </View>
    </View>
  );
}

export function LrDocument({
  lr,
  qr,
  size = "a4",
  copies = "all",
}: {
  lr: LrPdfData;
  qr: string;
  size?: "a4" | "a5";
  copies?: CopyKey | "all";
}) {
  const compact = size === "a5";
  const s = makeStyles(compact);
  const selected = copies === "all" ? COPIES : COPIES.filter((c) => c.key === copies);

  return (
    <Document title={lr.lr_no} author={lr.org.legal_name}>
      {selected.map((copy) => (
        <Page key={copy.key} size={compact ? "A5" : "A4"} style={s.page}>
          {/* Watermark for the eye; solid badge so it is legible on a fax. */}
          <Text style={s.watermark} fixed>{copy.label}</Text>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginBottom: 2 }}>
            <Text style={s.copyBadge}>{copy.label}</Text>
          </View>
          <LrBody lr={lr} qr={qr} s={s} compact={compact} />
        </Page>
      ))}
    </Document>
  );
}
