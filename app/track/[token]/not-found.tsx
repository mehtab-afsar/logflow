import { PackageX } from "lucide-react";

export default function TrackNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col items-center justify-center gap-3 px-6 text-center">
      <PackageX className="size-8 text-line" strokeWidth={1.5} />
      <h1 className="text-lg font-medium">This tracking link isn&apos;t valid</h1>
      <p className="text-sm text-ink-3">
        The link may have been mistyped, or the consignment may not have been dispatched yet.
        Please check with your transporter.
      </p>
    </main>
  );
}
