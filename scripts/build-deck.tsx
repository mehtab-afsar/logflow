/**
 * Renders the pitch deck to docs/LogiFlow-pitch-deck.pdf.
 *
 * Built with the product's own PDF engine and palette on purpose: a deck that
 * looks like a different company from the software undermines the pitch, and
 * this way the deck cannot drift from the brand.
 *
 *   npm run deck
 */
import { renderToFile } from "@react-pdf/renderer";
import { registerPdfFonts } from "../lib/pdf/fonts";
import { Deck } from "./deck/Deck";

registerPdfFonts();

const OUT = "docs/LogiFlow-pitch-deck.pdf";

// Wrapped rather than top-level await: tsx transpiles this to CJS, which has
// no top-level await.
async function main() {
  await renderToFile(<Deck />, OUT);
  console.log(`\n  ${OUT}\n`);
}

main().catch((err) => {
  console.error("\nDeck build failed:", err.message);
  process.exit(1);
});
