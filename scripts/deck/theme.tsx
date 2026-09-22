import { StyleSheet } from "@react-pdf/renderer";

/**
 * The deck uses the product's own palette and type, because a pitch deck that
 * looks like a different company from the software undermines the pitch.
 * Values mirror app/globals.css.
 */
export const C = {
  paper: "#F7F7F4",
  white: "#FFFFFF",
  ink: "#15171C",
  ink2: "#4E525B",
  ink3: "#8A8E97",
  line: "#DEDFDA",
  lineSoft: "#ECEDE8",
  indigo: "#1E1B4B",
  indigoSoft: "#332E6B",
  indigoTint: "#ECEBF7",
  onIndigo: "#C9C8DE",
  onIndigoDim: "#8B89B8",
  marigold: "#E5A500",
  marigoldTint: "#FFF5D6",
  marigoldInk: "#7A5900",
  forest: "#1F7A4D",
  forestTint: "#E3F3EA",
  forestInk: "#17603C",
  alert: "#B42318",
} as const;

/**
 * 16:9, in points. Given as an explicit [width, height] tuple — do NOT also
 * pass orientation="landscape" to <Page>, which swaps an already-landscape
 * tuple back to portrait.
 */
export const SLIDE: [number, number] = [960, 540];

export const s = StyleSheet.create({
  page: {
    fontFamily: "Inter",
    backgroundColor: C.paper,
    color: C.ink,
    paddingTop: 52,
    paddingBottom: 44,
    paddingHorizontal: 60,
  },
  pageDark: {
    fontFamily: "Inter",
    backgroundColor: C.indigo,
    color: C.white,
    paddingTop: 52,
    paddingBottom: 44,
    paddingHorizontal: 60,
  },
  pageFlush: {
    fontFamily: "Inter",
    backgroundColor: C.paper,
    color: C.ink,
    paddingTop: 46,
    paddingBottom: 0,
    paddingHorizontal: 60,
  },

  eyebrow: {
    fontSize: 9.5, fontWeight: 600, letterSpacing: 1.6,
    color: C.ink3, textTransform: "uppercase", marginBottom: 12,
  },
  eyebrowLight: {
    fontSize: 9.5, fontWeight: 600, letterSpacing: 1.6,
    color: "#8B89B8", textTransform: "uppercase", marginBottom: 12,
  },

  h1: { fontSize: 42, fontWeight: 600, lineHeight: 1.1, letterSpacing: -0.8 },
  h2: { fontSize: 28, fontWeight: 600, lineHeight: 1.16, letterSpacing: -0.4 },
  h3: { fontSize: 15, fontWeight: 600, lineHeight: 1.3 },
  lead: { fontSize: 14, lineHeight: 1.55, color: C.ink2, marginTop: 12, maxWidth: 640 },
  leadLight: { fontSize: 14, lineHeight: 1.55, color: C.onIndigo, marginTop: 12, maxWidth: 640 },
  body: { fontSize: 11.5, lineHeight: 1.5, color: C.ink2 },
  bodyLight: { fontSize: 11.5, lineHeight: 1.5, color: C.onIndigo },
  mono: { fontFamily: "Mono" },

  footer: {
    position: "absolute", bottom: 20, left: 60, right: 60,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 8.5, color: C.ink3,
  },
  footerLight: {
    position: "absolute", bottom: 20, left: 60, right: 60,
    flexDirection: "row", justifyContent: "space-between",
    fontSize: 8.5, color: "#7B79A6",
  },

  card: {
    backgroundColor: C.white, borderWidth: 1, borderColor: C.line,
    borderRadius: 10, padding: 18,
  },
  cardDark: {
    backgroundColor: C.indigoSoft, borderWidth: 1, borderColor: "#443E86",
    borderRadius: 10, padding: 18,
  },
  row: { flexDirection: "row" },
  col: { flex: 1 },

  statNum: { fontFamily: "Mono", fontSize: 34, fontWeight: 500, letterSpacing: -1 },
  statLabel: { fontSize: 10.5, color: C.ink2, marginTop: 7, lineHeight: 1.4 },

  shot: { borderWidth: 1, borderColor: C.line, borderRadius: 8, objectFit: "contain" },
  rule: { height: 3, width: 40, backgroundColor: C.indigo, borderRadius: 2, marginBottom: 16 },
  ruleLight: { height: 3, width: 40, backgroundColor: C.marigold, borderRadius: 2, marginBottom: 16 },
});
