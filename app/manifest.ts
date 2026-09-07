import type { MetadataRoute } from "next";
import { BRAND_INDIGO, BRAND_CANVAS } from "@/lib/design/tokens";

/**
 * Lets a driver add the trip link to their home screen. Installable, not
 * required — the portal is an ordinary web page and must work the first time
 * it is opened from a WhatsApp message.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LogiFlow",
    short_name: "LogiFlow",
    description: "Lorry receipts, proof of delivery and freight bills for Indian transporters.",
    start_url: "/",
    display: "standalone",
    background_color: BRAND_CANVAS,
    theme_color: BRAND_INDIGO,
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
