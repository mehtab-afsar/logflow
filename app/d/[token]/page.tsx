import type { Metadata } from "next";
import { DriverPortal } from "@/features/driver/components/DriverPortal";

export const metadata: Metadata = {
  title: "Trip",
  description: "Your trip details.",
  // The driver's screen is a work tool, not a page to be indexed or shared.
  robots: { index: false, follow: false },
};

export default async function DriverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; // Next 16: params is a Promise
  return <DriverPortal token={token} />;
}
