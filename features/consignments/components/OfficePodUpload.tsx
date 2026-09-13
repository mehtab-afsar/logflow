"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The physical, signed POD reaching the office some other way than the
 * driver's own upload — posted, photographed by whoever was at the
 * delivery point, or brought back with the truck. Someone at the office
 * scans or photographs it in here.
 */
export function OfficePodUpload({ id, nextPageNo }: { id: string; nextPageNo: number }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("client_id", crypto.randomUUID());
      form.append("page_no", String(nextPageNo));

      const res = await fetch(`/api/consignments/${id}/pod`, { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Could not save this file");
        return;
      }
      toast.success("POD attached");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        onChange={onChange}
        className="hidden"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        <Upload className="size-3.5" strokeWidth={1.5} />
        {busy ? "Uploading…" : "Attach POD (on driver's behalf)"}
      </Button>
    </div>
  );
}
