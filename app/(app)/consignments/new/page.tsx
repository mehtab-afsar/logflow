import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verify";
import { LrForm } from "@/features/consignments/components/LrForm";
import type { TaxMode } from "@/lib/tax";

export const dynamic = "force-dynamic";

export default async function NewConsignmentPage({
  searchParams,
}: {
  searchParams: Promise<{ reservation_id?: string }>;
}) {
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");
  if (!["owner", "dispatcher"].includes(auth.ctx.role)) {
    redirect("/consignments");
  }

  const { reservation_id } = await searchParams; // Next 16: searchParams is a Promise

  const supabase = await createClient();

  // Claiming here, on load, is what makes it safe for a colleague to reopen
  // this exact URL after an earlier attempt failed partway through —
  // claim_blank_lr_reservation() is idempotent for exactly this reason.
  interface ClaimedReservation { id: string; lr_no: string; branch_id: string; reserved_date: string }
  let reservation: ClaimedReservation | null = null;
  if (reservation_id) {
    const { data: claimed, error } = await supabase.rpc("claim_blank_lr_reservation", {
      p_reservation_id: reservation_id,
    });
    if (error || !claimed) redirect("/consignments/blank-forms");
    reservation = claimed as unknown as ClaimedReservation;
  }
  const [{ data: org }, { data: branches }, { data: parties }, { data: vehicles }, { data: drivers }, { data: profile }, { data: chargeTypes }] =
    await Promise.all([
      supabase.from("organisations").select("tax_mode, state_code").eq("id", auth.ctx.orgId).single(),
      supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
      supabase.from("parties").select("id, name, gstin, state_code, addresses, party_role").is("deleted_at", null).order("name"),
      supabase.from("vehicles").select("id, reg_number, vehicle_type").is("deleted_at", null).order("reg_number"),
      supabase.from("drivers").select("id, full_name, phone").is("deleted_at", null).order("full_name"),
      supabase.from("profiles").select("home_branch_id").eq("id", auth.ctx.userId).single(),
      supabase.from("charge_types").select("id, code, label, default_billable_to_consignor, default_billable_to_vendor")
        .is("deleted_at", null).order("is_system", { ascending: false }).order("label"),
    ]);

  // Falls back to the first branch — alphabetically, so not a great default —
  // only when nothing was chosen, or the chosen one is gone or deactivated
  // since. See migration 20260910000001 for why this exists at all.
  const activeBranchIds = new Set((branches ?? []).map((b) => b.id));
  const defaultBranchId =
    profile?.home_branch_id && activeBranchIds.has(profile.home_branch_id)
      ? profile.home_branch_id
      : (branches?.[0]?.id ?? "");

  return (
    <div className="space-y-5 p-6">
      <Link href="/consignments" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" strokeWidth={1.5} />
        Lorry receipts
      </Link>

      <header>
        <h1 className="text-xl font-semibold">
          {reservation ? `Reconcile ${reservation.lr_no}` : "New lorry receipt"}
        </h1>
        <p className="text-sm text-ink-3">
          {reservation
            ? "Fill in what was written on the paper form. The number was already printed and cannot change."
            : "The number is assigned automatically and cannot be duplicated."}
        </p>
      </header>

      <LrForm
        taxMode={(org?.tax_mode ?? "rcm") as TaxMode}
        orgStateCode={org?.state_code ?? "29"}
        branches={(branches ?? []).map((b) => ({ id: b.id, label: b.name }))}
        defaultBranchId={defaultBranchId}
        reservation={reservation ?? undefined}
        parties={(parties ?? []).map((p) => ({
          id: p.id, name: p.name, gstin: p.gstin, state_code: p.state_code,
          addresses: p.addresses as { city?: string; state_code?: string }[] | null,
          party_role: p.party_role,
        }))}
        vehicles={(vehicles ?? []).map((v) => ({ id: v.id, label: `${v.reg_number} · ${v.vehicle_type}` }))}
        drivers={(drivers ?? []).map((d) => ({ id: d.id, label: `${d.full_name} · ${d.phone}` }))}
        chargeTypes={chargeTypes ?? []}
      />
    </div>
  );
}
