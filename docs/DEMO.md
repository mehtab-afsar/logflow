# LogiFlow — 20-minute demo script

**Audience:** the owner, and whoever actually creates the lorry receipts.
**Length:** 20 minutes, plus 10 for questions.
**You need:** a laptop, two phones, and their paper LR book on the table.

---

## Before they arrive

```bash
npx supabase start
npm run db:seed:demo        # realistic dataset, their org name
npm run dev
```

Then, physically:

1. **Their own paper LR book, open, next to the laptop.** This is the single most
   effective prop you have. Everything you show is measured against it.
2. **Phone A** — the driver's phone. Open the driver link, then lock it. Do not
   leave it on the screen; the moment where you *send* the link is the point.
3. **Phone B** — the customer's phone. Open WhatsApp, ready to receive the
   tracking link.
4. Browser: two tabs — the dashboard, and the LR register. Nothing else. Close
   your email.
5. **Turn off notifications on the laptop.**

Have written down, so you never hunt for it mid-demo:

- the draft LR number you will dispatch live
- the truck whose fitness expires in 6 days
- the consignor for the batch bill

---

## Minute 0–2 · Their book, then ours

> "Before I show you anything — can I see your LR book?"

Let them open it. Point at a filled page.

> "This is the document your business runs on. Everything I'm going to show you
> is this page, and nothing else. I'm not going to ask you to change how you
> work."

Now put the printed LogiFlow LR next to it.

> "Same fields. Same order. Four copies — consignor, consignee, driver, office.
> The only difference is that this one can't be lost, and the office has it
> before the truck gets back."

**Do not touch the laptop yet.** Two minutes on paper earns you the next
eighteen.

---

## Minute 2–6 · Create a lorry receipt, live

Go to the register → **New LR**.

> "I'll make one now. Time me."

- **Consignor** — type three letters. The list narrows; the GSTIN is on screen.
  > "Your parties are in here once. Nobody retypes a GSTIN again."
- **Consignee** — three letters.
- **Cargo, weight, e-way bill number.**
  > "The e-way bill number is on the slip, so at the checkpost your driver hands
  > over one piece of paper instead of two."
- **Freight ₹42,000.** Watch the right-hand panel.
  > "That's the LR as it will print, updating as I type."

**The tax line is the moment.** Point at it.

> "You're on reverse charge, so the LR says: *GST payable by recipient under
> reverse charge, Notification 13/2017*. No GST line at all. If your CA moves
> you to 5% forward charge, you change one setting and every new LR follows —
> and every old one still prints exactly as it was signed."

**Save & Print.**

> "Under a minute. And that number —" point at `LF-2627-000412` — "can't be
> issued twice, and if it's cancelled it's never reused. Your book already works
> that way. So does this."

---

## Minute 6–10 · The driver, on an actual phone

Click **Send to driver**. WhatsApp opens with the message composed.

> "Your driver doesn't install anything. He already has WhatsApp."

Hand them **Phone A**. Let *them* tap the link — not you.

> "Go ahead, open it."

Talk while they look:

> "It's in Hindi because that driver's record says Hindi. Kannada if he's
> Kannada. He didn't choose anything."

Ask them to tap the big button. **Loaded** → **Departed**.

> "One button. Always the next thing. He can't get it wrong."

Now the part that matters:

> "Put it in aeroplane mode."

Have them tap **Reached destination**, then photograph anything as the POD.

> "No signal. Watch the bottom of the screen — *saved on your phone*. He doesn't
> get an error. He doesn't retry. Now turn the signal back on."

Wait. The bar clears.

> "Gone. It sent itself. That is the whole reason this works at a plant gate
> where there's no network."

---

## Minute 10–13 · What the customer sees

Refresh the dashboard. The card has moved on its own.

> "I didn't refresh that. Your dispatcher watches this board and sees the truck
> move as the driver reports."

Now click **Send tracking**, and send it to **Phone B**.

> "This is what your customer gets instead of calling you."

Hand them Phone B. Let them open it in WhatsApp.

> "Milestones, truck number, driver's first name, and the signed POD when it's
> in. What it does *not* show —" pause "— is your freight, your customer's
> GSTIN, or anyone's phone number. Your consignee can forward this to anyone.
> It gives nothing away."

---

## Minute 13–16 · POD to bill

Back on the laptop, open the delivered LR. Show the POD photo full size.

> "That's what the driver shot twenty minutes ago."

**Mark verified.**

> "Now it's billable. Not before — a POD nobody has checked shouldn't turn into
> an invoice."

Go to **Freight bills**. Select all the verified LRs for one consignor.

> "Five trips, one consignor, one bill."

**Generate bill.** Open the PDF.

> "Delivered at four. Billed at five past four. Today, that POD is in the
> driver's shirt pocket for another eleven days."

Then download the CSV.

> "And that goes straight into Tally."

---

## Minute 16–18 · The settlement argument

Open the trip's settlement view.

> "You gave him ₹10,000 at dispatch. He put ₹8,640 of diesel and ₹1,250 of toll
> in himself — he entered those on his phone, with photos of the bills. So he
> owes you ₹110, and it's a line item, not an argument."

Let that sit. This is the slide owners lean forward at.

---

## Minute 18–20 · The pilot, and the close

Go to the dashboard. Point at the exceptions panel.

> "Two trucks with no update since yesterday. Two PODs nobody has checked. One
> e-way bill expiring tonight. And that truck —" point "— its fitness runs out
> in six days."

Then:

> "Thirty days free. One branch, unlimited LRs. We put in your parties, your
> trucks and your drivers, we match your LR layout, and we train whoever writes
> them.
>
> What I need from you to start: your GSTIN, one filled page from that book, and
> your truck and driver lists.
>
> When do you want to start?"

**Stop talking.**

---

## Questions you will be asked

| They ask | You say |
|---|---|
| "We're on RCM, we don't charge GST." | "Then it prints the RCM note and no tax line. That's the setting we'd confirm with your CA on day one." |
| "Our drivers can't read English." | Switch the language on the phone in front of them. |
| "The network is bad at the plant." | Aeroplane mode again. It's a ten-second answer. |
| "Can it make e-way bills?" | "It captures every field today and prints the number on the LR. Generating them through the NIC API is the next thing we build, after the pilot." |
| "What about Tally?" | "CSV export today, in the format Tally imports. Direct sync is Phase 2." |
| "What if you disappear?" | "Your data is exportable in one click, and the printed LR is a paper document you keep regardless." |
| "How much?" | "Free for thirty days. After that ₹3,000–6,000 a month per branch depending on fleet size. No per-LR charge — we don't want you thinking about cost every time you dispatch." |

---

## Reset between demos

```bash
npm run db:clean && npm run db:seed:demo
```

Restores the org to its pre-demo state: the draft LR is a draft again, the
bills are gone, and the exception panel is repopulated.

---

## What not to do

- **Don't show the settings page** unless asked. It invites a configuration
  conversation instead of a business one.
- **Don't demo on your own phone.** Put it in their hands. The whole pitch is
  "your driver can do this", and they need to feel it.
- **Don't explain the architecture.** Nobody buying this cares that the numbers
  are gapless because of a transactional counter. They care that the number
  can't repeat.
- **Don't apologise for anything missing.** Note it, say when it lands, move on.
