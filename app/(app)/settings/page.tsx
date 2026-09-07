import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyAuth } from "@/lib/auth/verify";
import { RCM_NOTE } from "@/lib/tax";

export const dynamic = "force-dynamic";

const TAX_MODE_COPY: Record<string, { title: string; body: string }> = {
  rcm: {
    title: "Reverse charge (RCM)",
    body: `You do not charge GST on the lorry receipt; the customer pays it directly. The LR prints: "${RCM_NOTE}"`,
  },
  fcm_5: {
    title: "Forward charge at 5%",
    body: "You charge 5% GST and cannot claim input tax credit. Split as CGST+SGST within your state, IGST outside it.",
  },
  fcm_18: {
    title: "Forward charge at 18%",
    body: "You charge 18% GST and can claim input tax credit. Split as CGST+SGST within your state, IGST outside it.",
  },
};

export default async function SettingsPage() {
  const auth = await verifyAuth();
  if (!auth.ok) redirect("/");

  const supabase = await createClient();
  const [{ data: org }, { data: branches }, { data: staff }] = await Promise.all([
    supabase.from("organisations").select("*").eq("id", auth.ctx.orgId).single(),
    supabase.from("branches").select("*").order("name"),
    supabase.from("profiles").select("id, full_name, role").order("full_name"),
  ]);

  const mode = TAX_MODE_COPY[org?.tax_mode ?? "rcm"];

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>

      <section className="space-y-3 rounded-[10px] border bg-white p-5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">Organisation</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Row label="Legal name" value={org?.legal_name} />
          <Row label="GSTIN" value={org?.gstin ?? org?.transin} mono />
          <Row label="PAN" value={org?.pan} mono />
          <Row label="State code" value={org?.state_code} />
          <div className="sm:col-span-2">
            <Row label="Address" value={org?.address} />
          </div>
        </dl>
      </section>

      <section className="rounded-[10px] border bg-white p-5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-ink-3">Tax treatment</h2>
        <p className="mt-2 font-medium">{mode.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-2">{mode.body}</p>
        <p className="mt-3 rounded-md bg-marigold-tint p-3 text-xs text-marigold-ink">
          This setting changes every lorry receipt and freight bill you issue. Confirm it with your
          chartered accountant before going live. Documents already issued keep the treatment they
          were created with.
        </p>
      </section>

      <section className="rounded-[10px] border bg-white p-5">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-3">Branches</h2>
        <ul className="divide-y text-sm">
          {(branches ?? []).map((b) => (
            <li key={b.id} className="flex items-center justify-between py-2">
              <span>{b.name}{b.city ? ` · ${b.city}` : ""}</span>
              <span className="font-mono text-xs text-ink-3">
                {b.lr_prefix}-… / {b.inv_prefix}-…
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[10px] border bg-white p-5">
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-3">People</h2>
        <ul className="divide-y text-sm">
          {(staff ?? []).map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2">
              <span>{p.full_name ?? "—"}</span>
              <span className="text-xs capitalize text-ink-3">{p.role}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-3">
          Drivers and customers never get accounts — they use the links you send them.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className={`mt-0.5 ${mono ? "font-mono" : ""}`}>{value || "—"}</dd>
    </div>
  );
}
