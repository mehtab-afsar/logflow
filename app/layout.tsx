import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * Plex is a document-grade industrial sans: it holds up at 12px on the office
 * monitors these screens are read on, and its mono companion gives us tabular
 * figures for LR numbers, amounts and vehicle registrations.
 */
const plexSans = IBM_Plex_Sans({
  variable: "--font-sans",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "LogiFlow — your LR book, POD and freight bill in one place",
    template: "%s · LogiFlow",
  },
  description:
    "Dispatch software for Indian FTL transporters running 5 to 60 trucks. Digital lorry receipts, WhatsApp-based driver updates, digital proof of delivery and same-day freight billing.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
