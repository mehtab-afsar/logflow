import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // fontkit/pdfkit read .afm metric files from disk at module scope. Bundling them
  // breaks the build with "Can't resolve 'fs'". Keep them external to the bundle.
  serverExternalPackages: ["@react-pdf/renderer"],

  // There is no login screen yet — onboarding is a later phase. Old bookmarks,
  // browser autocomplete and anything still linking to a sign-in route should
  // land in the app rather than on a 404. Config redirects run before the
  // proxy, so the auto sign-in then applies as normal.
  async redirects() {
    return [
      { source: "/login", destination: "/dashboard", permanent: false },
      { source: "/signin", destination: "/dashboard", permanent: false },
      { source: "/sign-in", destination: "/dashboard", permanent: false },
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
