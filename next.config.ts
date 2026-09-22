import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Every LAN address this machine currently has.
 *
 * Next blocks cross-origin dev requests unless the host is listed, so opening
 * the app from a phone on the same Wi-Fi breaks hot reload with an opaque
 * WebSocket handshake error. Computed rather than hard-coded because the
 * address changes every time the machine joins a different network — and
 * testing the driver link on a real phone is something we do constantly.
 */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
    .filter((n) => n.family === "IPv4" && !n.internal)
    .map((n) => n.address);
}

const nextConfig: NextConfig = {
  // Development only; ignored in a production build.
  allowedDevOrigins: lanAddresses(),

  // The floating dev-tools badge sits over the sidebar and lands in every
  // screenshot, including the ones that go into the pitch deck.
  devIndicators: false,

  // fontkit/pdfkit read .afm metric files from disk at module scope. Bundling them
  // breaks the build with "Can't resolve 'fs'". Keep them external to the bundle.
  serverExternalPackages: ["@react-pdf/renderer"],

  // "/login" is a real page now (app/login/page.tsx) — no redirect for it.
  // The other spellings, and signing out, still have nowhere of their own.
  async redirects() {
    return [
      { source: "/signin", destination: "/login", permanent: false },
      { source: "/sign-in", destination: "/login", permanent: false },
      { source: "/logout", destination: "/", permanent: false },
      { source: "/signout", destination: "/", permanent: false },
    ];
  },

  // iOS Safari requests these fixed root paths; Next serves the App Router
  // convention names. Without the rewrite a driver adding the trip to their
  // home screen gets a 404 and a blank icon.
  async rewrites() {
    return [
      { source: "/apple-touch-icon.png", destination: "/apple-icon.png" },
      { source: "/apple-touch-icon-precomposed.png", destination: "/apple-icon.png" },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(), microphone=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
