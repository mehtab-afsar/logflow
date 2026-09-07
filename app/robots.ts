import type { MetadataRoute } from "next";

/**
 * Token-scoped URLs must never be crawled or indexed.
 *
 * A tracking link is unguessable but not secret — it gets forwarded over
 * WhatsApp and pasted into email. Letting a crawler index one would turn a
 * private link into a public, searchable page. Same for driver links.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/d/", "/track/", "/api/", "/dashboard", "/consignments", "/bills", "/fleet", "/parties", "/settings"],
      },
    ],
  };
}
