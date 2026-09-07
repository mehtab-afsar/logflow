/**
 * Display formatting for Indian users.
 *
 * All dates render in Asia/Kolkata regardless of where the server runs — a
 * dispatcher in Bengaluru reading "07-09-2026" must never see the previous
 * day because Vercel executed the render in us-east-1.
 */
const IST = "Asia/Kolkata";

/** DD-MM-YYYY, the form printed on every Indian transport document. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: IST, day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d).replace(/\//g, "-");
}

/** DD-MM-YYYY HH:mm */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  const date = formatDate(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
  return `${date} ${time}`;
}

/** "3 h ago", "2 d ago" — the Kanban card's staleness signal. */
export function timeAgo(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (Number.isNaN(mins)) return "—";
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

/** Whole days until a date; negative when already past. */
export function daysUntil(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

/** Weight in kg → "18.0 t" when large enough to be worth reading as tonnes. */
export function formatWeight(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return "—";
  return kg >= 1000 ? `${(kg / 1000).toFixed(2)} t` : `${kg} kg`;
}

export function formatRoute(from: string, to: string): string {
  return `${from} → ${to}`;
}
