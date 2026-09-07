import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verify";
import { LrForm } from "@/features/consignments/components/LrForm";
import type { TaxMode } from "@/lib/tax";

export const dynamic = "force-dynamic";

export default async function NewConsignmentPage() {
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");
  if (!["owner", "dispatcher"].includes(auth.ctx.role)) {
    redirect("/consignments");
  }

  const supabase = await createClient();
  const [{ data: org }, { data: branches }, { data: parties }, { data: vehicles }, { data: drivers }] =
    await Promise.all([
      supabase.from("organisations").select("tax_mode, state_code").eq("id", auth.ctx.orgId).single(),
      supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
      supabase.from("parties").select("id, name, gstin, state_code, addresses").is("deleted_at", null).order("name"),
      supabase.from("vehicles").select("id, reg_number, vehicle_type").is("deleted_at", null).order("reg_number"),
      supabase.from("drivers").select("id, full_name, phone").is("deleted_at", null).order("full_name"),
    ]);

  return (
    <div className="space-y-5 p-6">
      <Link href="/consignments" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
        <ArrowLeft className="size-4" strokeWidth={1.5} />
        Lorry receipts
      </Link>

      <header>
        <h1 className="text-xl font-semibold">New lorry receipt</h1>
        <p className="text-sm text-neutral-500">
          The number is assigned automatically and cannot be duplicated.
        </p>
      </header>

      <LrForm
        taxMode={(org?.tax_mode ?? "rcm") as TaxMode}
        orgStateCode={org?.state_code ?? "29"}
        branches={(branches ?? []).map((b) => ({ id: b.id, label: b.name }))}
        parties={(parties ?? []).map((p) => ({
          id: p.id, name: p.name, gstin: p.gstin, state_code: p.state_code,
          addresses: p.addresses as { city?: string; state_code?: string }[] | null,
        }))}
        vehicles={(vehicles ?? []).map((v) => ({ id: v.id, label: `${v.reg_number} · ${v.vehicle_type}` }))}
        drivers={(drivers ?? []).map((d) => ({ id: d.id, label: `${d.full_name} · ${d.phone}` }))}
      />
    </div>
  );
}
