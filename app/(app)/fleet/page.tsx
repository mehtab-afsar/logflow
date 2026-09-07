import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verify";
import { VehiclesTable, DriversTable } from "@/features/masters/components/FleetTables";

export const dynamic = "force-dynamic";

export default async function FleetPage() {
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");

  const canWrite = ["owner", "dispatcher"].includes(auth.ctx.role);
  const canDelete = auth.ctx.role === "owner";

  const supabase = await createClient();
  const [{ data: vehicles }, { data: drivers }] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id, reg_number, vehicle_type, capacity_tons, ownership, rc_expiry, fitness_expiry, insurance_expiry, permit_expiry, puc_expiry")
      .is("deleted_at", null)
      .order("reg_number"),
    supabase
      .from("drivers")
      .select("id, full_name, phone, dl_number, dl_expiry, language")
      .is("deleted_at", null)
      .order("full_name"),
  ]);

  return (
    <div className="space-y-8 p-6">
      <header>
        <h1 className="text-xl font-semibold">Fleet</h1>
        <p className="text-sm text-ink-3">
          Document expiries are flagged 30 days out, then again inside 15.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">Vehicles</h2>
        <VehiclesTable rows={vehicles ?? []} canWrite={canWrite} canDelete={canDelete} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">Drivers</h2>
        <DriversTable rows={drivers ?? []} canWrite={canWrite} canDelete={canDelete} />
      </section>
    </div>
  );
}
