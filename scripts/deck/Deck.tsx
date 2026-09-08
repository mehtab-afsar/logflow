import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { join } from "node:path";
import { C, s, SLIDE } from "./theme";
import { PdfMark } from "../../lib/pdf/PdfMark";

const shot = (n: string) => join(process.cwd(), "docs", "deck-shots", `${n}.png`);

/* ── shared furniture ─────────────────────────────────────────────────── */

function Footer({ n, dark }: { n: number; dark?: boolean }) {
  return (
    <View style={dark ? s.footerLight : s.footer} fixed>
      <Text>LogiFlow</Text>
      <Text>{n}</Text>
    </View>
  );
}

function Slide({
  n, eyebrow, title, children, dark, flush,
}: {
  n: number; eyebrow?: string; title?: string;
  children?: React.ReactNode; dark?: boolean; flush?: boolean;
}) {
  return (
    <Page size={SLIDE} style={flush ? s.pageFlush : dark ? s.pageDark : s.page}>
      {/* Centred rather than top-aligned: slide content varies in length, and
          anchoring to the top leaves the short ones floating in white space. */}
      <View style={{ flex: 1, justifyContent: "center" }}>
        {eyebrow && <Text style={dark ? s.eyebrowLight : s.eyebrow}>{eyebrow}</Text>}
        {title && <Text style={[s.h2, dark ? { color: C.white } : {}]}>{title}</Text>}
        {children}
      </View>
      <Footer n={n} dark={dark} />
    </Page>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <View style={[s.card, s.col, { marginRight: 14 }]}>
      <Text style={[s.statNum, { color: tone ?? C.ink }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function Bullet({ head, body, tone }: { head: string; body: string; tone?: string }) {
  return (
    <View style={{ marginBottom: 13, flexDirection: "row" }}>
      <View style={{ width: 3, borderRadius: 2, backgroundColor: tone ?? C.indigo, marginRight: 11 }} />
      <View style={{ flex: 1 }}>
        <Text style={s.h3}>{head}</Text>
        <Text style={[s.body, { marginTop: 3 }]}>{body}</Text>
      </View>
    </View>
  );
}

/** A slide that is mostly a product screenshot, with a short claim beside it. */
function ShotSlide({
  n, eyebrow, title, note, image, tall,
}: {
  n: number; eyebrow: string; title: string; note: string; image: string; tall?: boolean;
}) {
  return (
    <Page size={SLIDE} style={s.page}>
      <View style={{ flexDirection: "row", flex: 1 }}>
        <View style={{ width: 246, paddingRight: 24, justifyContent: "center" }}>
          <Text style={s.eyebrow}>{eyebrow}</Text>
          <View style={s.rule} />
          <Text style={[s.h2, { fontSize: 24 }]}>{title}</Text>
          <Text style={[s.body, { marginTop: 12 }]}>{note}</Text>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Image src={image} style={[s.shot, tall ? { height: 418 } : { width: 596 }]} />
        </View>
      </View>
      <Footer n={n} />
    </Page>
  );
}

/* ── the deck ─────────────────────────────────────────────────────────── */

export function Deck() {
  return (
    <Document title="LogiFlow — dispatch, proof of delivery and freight billing" author="LogiFlow">

      {/* 1 · Cover */}
      <Page size={SLIDE} style={s.pageDark}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 34 }}>
            <PdfMark size={30} color={C.white} />
            <Text style={{ marginLeft: 11, fontSize: 19, fontWeight: 600, color: C.white }}>LogiFlow</Text>
          </View>

          <Text style={[s.h1, { color: C.white, maxWidth: 720 }]}>
            Your LR book, POD and freight bill — in one place, in one minute.
          </Text>

          <Text style={[s.leadLight, { fontSize: 15, marginTop: 20 }]}>
            Dispatch software for Indian FTL transporters running 5 to 60 trucks. Drivers need
            only WhatsApp. Customers stop calling. You bill the same day the truck is unloaded.
          </Text>
        </View>
        <Footer n={1} dark />
      </Page>

      {/* 2 · The problem */}
      <Slide n={2} eyebrow="The problem" title="The money is stuck in the paperwork, not the trucking.">
        <Text style={s.lead}>
          A transporter running 20 trucks does everything right operationally and still waits two
          months to be paid — because the document that proves delivery travels back in a driver&apos;s
          shirt pocket.
        </Text>
        <View style={[s.row, { marginTop: 30 }]}>
          <Stat value="7–20 days" label="for a signed POD to reach the office" />
          <Stat value="60–90 days" label="actual receivable cycle, against 30 contracted" tone={C.alert} />
          <View style={[s.card, s.col]}>
            <Text style={[s.statNum, { color: C.ink }]}>₹19,000 Cr</Text>
            <Text style={s.statLabel}>of freight receivables stuck industry-wide in the POD-to-invoice gap</Text>
          </View>
        </View>
        <Text style={[s.body, { marginTop: 24, color: C.ink3 }]}>
          Today that runs on a paper LR book, one WhatsApp group per truck, and a Tally operator
          who invoices when the paper finally arrives.
        </Text>
      </Slide>

      {/* 3 · What it is */}
      <Slide n={3} eyebrow="What LogiFlow is" title="Three documents. Nothing else.">
        <Text style={s.lead}>
          Not an ERP. Not accounting. Just the three pieces of paper that move money — done
          properly, and done in the order your office already works.
        </Text>
        <View style={[s.row, { marginTop: 28 }]}>
          <View style={[s.card, s.col, { marginRight: 14 }]}>
            <Text style={[s.eyebrow, { marginBottom: 8 }]}>01 · Lorry receipt</Text>
            <Text style={s.h3}>Compliant, in under a minute</Text>
            <Text style={[s.body, { marginTop: 7 }]}>
              Auto-numbered and gapless. E-way bill on the slip. Four copies. The GST line is
              whatever your CA says it is — including no GST line at all.
            </Text>
          </View>
          <View style={[s.card, s.col, { marginRight: 14 }]}>
            <Text style={[s.eyebrow, { marginBottom: 8 }]}>02 · Proof of delivery</Text>
            <Text style={s.h3}>Photographed at the gate</Text>
            <Text style={[s.body, { marginTop: 7 }]}>
              The driver taps a WhatsApp link. No app, no login, no training. It works with no
              signal and sends itself when the network returns.
            </Text>
          </View>
          <View style={[s.card, s.col]}>
            <Text style={[s.eyebrow, { marginBottom: 8 }]}>03 · Freight bill</Text>
            <Text style={s.h3}>The same afternoon</Text>
            <Text style={[s.body, { marginTop: 7 }]}>
              A verified POD makes the trip billable. One click raises the bill for one LR or
              twenty, as a PDF and as a Tally-ready CSV.
            </Text>
          </View>
        </View>
      </Slide>

      {/* 4 · Product — dashboard */}
      <ShotSlide
        n={4}
        eyebrow="The office"
        title="Every truck, on one screen"
        note="Trips by state, what is stuck, and what is owed. The board moves on its own as drivers report — nobody refreshes anything. The panel on the right is the day's actual exceptions: trips gone quiet, PODs nobody has checked, an e-way bill expiring tonight."
        image={shot("dashboard")}
      />

      {/* 5 · Product — LR creation */}
      <ShotSlide
        n={5}
        eyebrow="Creating a lorry receipt"
        title="Under 60 seconds, and the number cannot repeat"
        note="Type three letters and the party appears with its GSTIN. The panel on the right is the LR exactly as it will print, updating as you type. Numbers are gapless per branch per financial year — and a cancelled LR keeps its number forever, the way your book already works."
        image={shot("new-lr")}
      />

      {/* 6 · Product — the driver */}
      <Page size={SLIDE} style={s.page}>
        <View style={{ flexDirection: "row", flex: 1 }}>
          <View style={{ width: 330, paddingRight: 30 }}>
            <Text style={s.eyebrow}>The driver</Text>
            <View style={s.rule} />
            <Text style={[s.h2, { fontSize: 24 }]}>No app. One button. Works with no signal.</Text>
            <View style={{ marginTop: 18 }}>
              <Bullet head="He already has WhatsApp" body="You tap Send to driver; he taps the link. Nothing to install, nothing to remember." />
              <Bullet head="In his language, automatically" body="Hindi or Kannada from his driver record. He never finds a setting." tone={C.marigold} />
              <Bullet head="Saved on the phone when there is no network" body="At a plant gate with no signal, the POD is stored and sends itself later. He never sees an error." tone={C.forest} />
            </View>
          </View>
          <View style={{ flex: 1, flexDirection: "row", justifyContent: "center", alignItems: "flex-start" }}>
            <Image src={shot("driver")} style={[s.shot, { height: 392, marginRight: 18 }]} />
            <Image src={shot("driver-hindi")} style={[s.shot, { height: 392 }]} />
          </View>
        </View>
        <Footer n={6} />
      </Page>

      {/* 7 · Product — tracking */}
      <Page size={SLIDE} style={s.page}>
        <View style={{ flexDirection: "row", flex: 1 }}>
          <View style={{ width: 400, paddingRight: 34 }}>
            <Text style={s.eyebrow}>Your customer</Text>
            <View style={s.rule} />
            <Text style={[s.h2, { fontSize: 24 }]}>They stop calling the office.</Text>
            <Text style={[s.body, { marginTop: 14 }]}>
              One link, sent on WhatsApp. It opens instantly on any phone, works even with
              JavaScript disabled, and shows the milestones, the truck number, the driver&apos;s first
              name and the signed POD.
            </Text>
            <View style={[s.card, { marginTop: 20, backgroundColor: C.forestTint, borderColor: C.forest }]}>
              <Text style={[s.h3, { color: C.forestInk }]}>What it never shows</Text>
              <Text style={[s.body, { marginTop: 6, color: C.forestInk }]}>
                Your freight. Your advance. Anyone&apos;s GSTIN or phone number. Your consignee can
                forward this link to whoever they like — it gives nothing away.
              </Text>
            </View>
          </View>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Image src={shot("tracking")} style={[s.shot, { height: 404 }]} />
          </View>
        </View>
        <Footer n={7} />
      </Page>

      {/* 8 · Product — the register */}
      <ShotSlide
        n={8}
        eyebrow="The register"
        title="Your LR book, searchable"
        note="Every consignment you have ever issued, filterable by state, date, party or truck, and exportable. The number, the route, the freight and the status — the same columns as the book, except you can find things in it."
        image={shot("register")}
      />

      {/* 9 · Product — the record */}
      <ShotSlide
        n={9}
        eyebrow="One consignment"
        title="Everything about a trip, in one place"
        note="Both parties as they were when the LR was signed, the cargo, the e-way bill, the full event trail with times, the signed POD, and the money — including what the driver spent and what he is owed. Nothing here has to be reconstructed from a WhatsApp group."
        image={shot("lr-detail")}
      />

      {/* 10 · Same-day billing */}
      <ShotSlide
        n={10}
        eyebrow="Getting paid"
        title="Delivered at four. Billed at five past."
        note="A verified POD makes a trip billable — not before, because an invoice built on an unchecked POD is a dispute waiting to happen. Select every verified trip for one consignor and raise one bill: PDF for the customer, CSV straight into Tally."
        image={shot("bills")}
      />

      {/* 11 · Fleet */}
      <ShotSlide
        n={11}
        eyebrow="The fleet"
        title="The document that expires mid-trip"
        note="Fitness, insurance, permit, PUC and RC for every truck, flagged at thirty days and again inside fifteen. A truck stopped at a checkpost for an expired fitness certificate costs more than a month of this software."
        image={shot("fleet")}
      />

      {/* 12 · Built for India */}
      <Slide n={12} eyebrow="Built for how this actually works" title="Not a global tool with a rupee sign added.">
        <View style={[s.row, { marginTop: 26 }]}>
          <View style={{ flex: 1, paddingRight: 18 }}>
            <Bullet head="RCM, 5% or 18% — set once" body="Most fleets under twenty trucks are on reverse charge, and the LR then prints the statutory note with no GST line at all. Change the mode and every new document follows; every old one prints exactly as it was signed." />
            <Bullet head="E-way bill on the slip" body="Number, validity and distance captured with the LR, so the driver hands the checkpost one piece of paper." tone={C.marigold} />
          </View>
          <View style={{ flex: 1 }}>
            <Bullet head="Hindi and Kannada on the driver's screen" body="Chosen from his record, not from a menu. Adding a language is a file, not a release." tone={C.forest} />
            <Bullet head="Built for a bad network" body="PODs are compressed on the phone and queued. A trip recorded with no signal is not a trip lost." />
          </View>
        </View>
        <View style={[s.card, { marginTop: 8, backgroundColor: C.indigoTint, borderColor: C.indigo }]}>
          <Text style={[s.body, { color: C.indigo }]}>
            Gapless LR numbering per branch per financial year, immutable event history on every
            status change, and a tracking link that cannot leak commercial data — because these are
            the things a CA and a customer will each test in the first ten minutes.
          </Text>
        </View>
      </Slide>

      {/* 13 · Positioning */}
      <Slide n={13} eyebrow="Where this sits" title="The first software a transporter adopts.">
        <Text style={s.lead}>
          The real competitor is not another product. It is the paper book, the WhatsApp group and
          the Tally operator — which are free, familiar, and work.
        </Text>
        <View style={{ marginTop: 24 }}>
          {[
            ["Enterprise shipper TMS", "Fretron, Shipsy, FarEye", "Sold to the manufacturer, not the transporter. Six-week implementations."],
            ["Transporter ERP", "Fleetable, Fleetx, LogiBrisk", "Full accounting and hire slips. Powerful, and far more than a 10-truck fleet will ever switch to."],
            ["Marketplaces", "BlackBuck, Vahak, Porter", "Finding loads. A different problem entirely."],
            ["Paper + WhatsApp + Tally", "What you use today", "Free and familiar. This is what LogiFlow has to beat, and the only thing it tries to replace."],
          ].map(([a, b, c], i) => (
            <View key={a} style={{ flexDirection: "row", paddingVertical: 9, borderTopWidth: i === 0 ? 0 : 1, borderColor: C.line }}>
              <Text style={[s.h3, { width: 190, fontSize: 12 }]}>{a}</Text>
              <Text style={[s.body, { width: 168, color: C.ink3 }]}>{b}</Text>
              <Text style={[s.body, { flex: 1 }]}>{c}</Text>
            </View>
          ))}
        </View>
      </Slide>

      {/* 14 · What changes */}
      <Slide n={14} eyebrow="What changes in thirty days" title="The numbers we will hold ourselves to." dark>
        <View style={[s.row, { marginTop: 30 }]}>
          {[
            ["5–8 min", "< 60 sec", "to write a lorry receipt"],
            ["7–20 days", "< 24 hrs", "for the POD to reach the office"],
            ["10–25 days", "≤ 2 days", "from delivery to invoice"],
            ["15–30 / day", "≤ 10 / day", "“where is my truck” calls"],
          ].map(([from, to, label], i) => (
            <View key={label} style={[s.cardDark, s.col, i < 3 ? { marginRight: 13 } : {}]}>
              <Text style={{ fontFamily: "Mono", fontSize: 12, color: C.onIndigoDim, textDecoration: "line-through" }}>{from}</Text>
              <Text style={{ fontFamily: "Mono", fontSize: 22, fontWeight: 500, color: C.white, marginTop: 5 }}>{to}</Text>
              <Text style={[s.bodyLight, { marginTop: 8, fontSize: 10.5 }]}>{label}</Text>
            </View>
          ))}
        </View>
        <Text style={[s.bodyLight, { marginTop: 26 }]}>
          Measured on your own dispatches, not ours. If the POD number does not move, the pilot has
          failed and you owe nothing.
        </Text>
      </Slide>

      {/* 15 · Pilot */}
      <Slide n={15} eyebrow="The offer" title="Thirty days free, for the first five fleets.">
        <View style={[s.row, { marginTop: 26 }]}>
          <View style={{ flex: 1, paddingRight: 26 }}>
            <Bullet head="We set it up, not you" body="Your parties, trucks and drivers imported. Your LR layout matched to the book you already print. Two training sessions for whoever writes them." />
            <Bullet head="One branch, unlimited lorry receipts" body="No per-LR fee, then or later. Nobody should hesitate to dispatch because the software charges by the document." tone={C.forest} />
            <Bullet head="Print the office copy for the first month" body="Keep the paper trail running in parallel until you trust it. We expect you to." tone={C.marigold} />
          </View>
          <View style={{ width: 300 }}>
            <View style={s.card}>
              <Text style={s.eyebrow}>After the pilot</Text>
              <Text style={[s.statNum, { fontSize: 27 }]}>₹3,000–6,000</Text>
              <Text style={s.statLabel}>per branch per month, tiered by fleet size (≤15 / ≤40 / ≤100 trucks). No per-LR fees.</Text>
              <View style={{ height: 1, backgroundColor: C.line, marginVertical: 14 }} />
              <Text style={[s.body, { fontSize: 10.5 }]}>
                One-time onboarding ₹10,000 — master data import, LR template match, training.
              </Text>
            </View>
          </View>
        </View>
      </Slide>

      {/* 16 · Close */}
      <Page size={SLIDE} style={s.pageDark}>
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={s.eyebrowLight}>To start</Text>
          <Text style={[s.h1, { color: C.white, fontSize: 34, maxWidth: 620 }]}>
            Three things, and we can run your first real load this week.
          </Text>
          <View style={{ flexDirection: "row", marginTop: 32 }}>
            {[
              ["Your GSTIN", "and the tax mode your CA uses — reverse charge, 5% or 18%"],
              ["One filled page", "from your LR book, so the printed copy matches what you already issue"],
              ["Your lists", "trucks with document expiry dates, drivers with mobile numbers, top twenty parties"],
            ].map(([h, b], i) => (
              <View key={h} style={[s.cardDark, s.col, i < 2 ? { marginRight: 14 } : {}]}>
                <Text style={{ fontSize: 13, fontWeight: 600, color: C.white }}>{h}</Text>
                <Text style={[s.bodyLight, { marginTop: 6, fontSize: 10.5 }]}>{b}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 40 }}>
            <PdfMark size={18} color={C.white} />
            <Text style={{ marginLeft: 9, fontSize: 13, fontWeight: 600, color: C.white }}>LogiFlow</Text>
            <Text style={[s.bodyLight, { marginLeft: 14 }]}>Bengaluru, Karnataka</Text>
          </View>
        </View>
        <Footer n={16} dark />
      </Page>
    </Document>
  );
}
