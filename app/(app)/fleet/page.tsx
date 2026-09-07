import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verify";
import { formatDate, daysUntil } from "@/lib/india/format";
import { expiryTone } from "@/lib/design/tokens";

export const dynamic = "force-dynamic";

const DOCS = [
  { key: "fitness_expiry", label: "Fitness" },
  { key: "insurance_expiry", label: "Insurance" },
  { key: "permit_expiry", label: "Permit" },
  { key: "puc_expiry", label: "PUC" },
  { key: "rc_expiry", label: "RC" },
] as const;

export default async function FleetPage() {
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");

  const supabase = await createClient();
  const [{ data: vehicles }, { data: drivers }] = await Promise.all([
    supabase.from("vehicles").select("*").is("deleted_at", null).order("reg_number"),
    supabase.from("drivers").select("*").is("deleted_at", null).order("full_name"),
  ]);

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Fleet</h1>
        <p className="text-sm text-neutral-500">
          {vehicles?.length ?? 0} vehicles · {drivers?.length ?? 0} drivers
        </p>
      </header>

      <section className="overflow-x-auto rounded-[10px] border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Vehicle</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Ownership</th>
              {DOCS.map((d) => (
                <th key={d.key} className="px-3 py-2 font-medium">{d.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {(vehicles ?? []).map((v) => (
              <tr key={v.id} className="row-dense">
                <td className="px-3 font-mono font-medium">{v.reg_number}</td>
                <td className="px-3 text-neutral-600">{v.vehicle_type}</td>
                <td className="px-3 text-neutral-600">{v.ownership}</td>
                {DOCS.map((d) => {
                  const value = v[d.key] as string | null;
                  const left = daysUntil(value);
                  const tone = expiryTone(left);
                  return (
                    <td key={d.key} className="px-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                          tone.tone === "ok" ? "text-neutral-500" : `border ${tone.className}`
                        }`}
                        title={value ? formatDate(value) : "Not recorded"}
                      >
                        {value
                          ? tone.tone === "expired"
                            ? `Expired ${formatDate(value)}`
                            : tone.tone === "ok"
                              ? formatDate(value)
                              : `${left} d left`
                          : "—"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto rounded-[10px] border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-neutral-50 text-left text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Driver</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Licence</th>
              <th className="px-3 py-2 font-medium">Expires</th>
              <th className="px-3 py-2 font-medium">Language</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(drivers ?? []).map((d) => (
              <tr key={d.id} className="row-dense">
                <td className="px-3 font-medium">{d.full_name}</td>
                <td className="px-3 font-mono text-neutral-600">{d.phone}</td>
                <td className="px-3 font-mono text-neutral-600">{d.dl_number ?? "—"}</td>
                <td className="px-3 text-neutral-600">{formatDate(d.dl_expiry)}</td>
                <td className="px-3 text-neutral-600">
                  {{ en: "English", hi: "हिन्दी", kn: "ಕನ್ನಡ" }[d.language] ?? d.language}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
