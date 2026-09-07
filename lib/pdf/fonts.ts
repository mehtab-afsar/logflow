import { join } from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * Registered once at module scope. Must be .ttf — fontkit cannot read woff2.
 * Absolute paths via process.cwd(): a relative path resolves against the
 * serverless bundle root and 404s in production.
 */
let registered = false;

export function registerPdfFonts(): void {
  if (registered) return;
  const dir = join(process.cwd(), "public", "fonts");

  Font.register({
    family: "Inter",
    fonts: [
      { src: join(dir, "Inter-Regular.ttf"), fontWeight: 400 },
      { src: join(dir, "Inter-Medium.ttf"), fontWeight: 500 },
      { src: join(dir, "Inter-SemiBold.ttf"), fontWeight: 600 },
    ],
  });

  Font.register({
    family: "Mono",
    fonts: [{ src: join(dir, "JetBrainsMono-Regular.ttf"), fontWeight: 400 }],
  });

  // Party names must not break mid-word across lines.
  Font.registerHyphenationCallback((word) => [word]);

  registered = true;
}
