import { formatINR } from "@/lib/money";

export interface Kpi {
  label: string;
  value: string;
  hint?: string;
}

export function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((k) => (
        <div key={k.label} className="rounded-[10px] border bg-white p-4">
          <p className="tabular text-[32px] font-semibold leading-none">{k.value}</p>
          <p className="mt-2 text-[13px] text-neutral-500">{k.label}</p>
          {k.hint && <p className="mt-0.5 text-xs text-neutral-400">{k.hint}</p>}
        </div>
      ))}
    </div>
  );
}

export function money(n: number): string {
  return formatINR(Math.round(n * 100));
}
