"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera, Check, MapPin, Phone, Plus, Truck, Package, Loader2,
} from "lucide-react";
import { useI18n, LANGS, type Lang, type TranslationKey } from "../hooks/useI18n";
import { useUploadQueue } from "../hooks/useUploadQueue";
import { QueueBanner } from "./QueueBanner";
import { compressForPod } from "../utils/compress-image";
import { nextMilestone, type Milestone } from "@/lib/consignments/state-machine";

interface Trip {
  lr_no: string;
  status: string;
  from_city: string;
  to_city: string;
  from_address: string | null;
  to_address: string | null;
  consignor: string | null;
  consignee: string | null;
  cargo: string;
  packages: number;
  packages_unit: string;
  weight_kg: number | null;
  instructions: string | null;
  vehicle_no: string | null;
  language: Lang | null;
  milestones_done: string[];
  pod_count: number;
}

const EXPENSE_KINDS = ["diesel", "toll", "loading", "unloading", "other"] as const;

export function DriverPortal({ token, officePhone }: { token: string; officePhone?: string }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [justDid, setJustDid] = useState<string | null>(null);
  const [showExpense, setShowExpense] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { lang, setLang, t } = useI18n();
  const queue = useUploadQueue();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/d/${token}/trip`);
      if (res.status === 410) {
        setError(t("linkExpired"));
        return;
      }
      if (!res.ok) throw new Error("failed");
      const { data } = await res.json();
      setTrip(data);
      if (data.language && !localStorage.getItem("lang-touched")) setLang(data.language);
    } catch {
      // Offline on first load: the queue still works, so don't hard-fail.
      setError((e) => e ?? null);
    } finally {
      setLoading(false);
    }
  }, [token, t, setLang]);

  useEffect(() => {
    // Deferred so the fetch's setState does not run synchronously inside the
    // mount effect.
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  // Refresh the card once the queue empties, so counts reflect the server.
  useEffect(() => {
    if (queue.pending !== 0 || loading) return;
    const t = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.pending]);

  const next: Milestone | null = trip ? nextMilestone(trip.milestones_done ?? []) : null;

  async function recordMilestone(kind: Milestone) {
    setJustDid(kind);
    await queue.add({
      id: crypto.randomUUID(),
      token,
      kind: "milestone",
      payload: { kind, at: new Date().toISOString() },
    });
    // Optimistic: the driver must see the step complete even with no signal.
    setTrip((prev) =>
      prev ? { ...prev, milestones_done: [...(prev.milestones_done ?? []), kind] } : prev,
    );
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    for (const [i, file] of files.entries()) {
      const blob = await compressForPod(file);
      await queue.add({
        id: crypto.randomUUID(),
        token,
        kind: "pod",
        payload: { page_no: (trip?.pod_count ?? 0) + i + 1 },
        blob,
        mime: "image/jpeg",
      });
    }
    setTrip((prev) =>
      prev ? { ...prev, pod_count: prev.pod_count + files.length } : prev,
    );
    setJustDid("pod");
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-neutral-500">
        <Loader2 className="size-6 animate-spin" strokeWidth={1.5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-medium">{error}</p>
        {officePhone && (
          <a
            href={`tel:${officePhone}`}
            className="touch-target flex items-center gap-2 rounded-md bg-primary px-6 text-primary-foreground"
          >
            <Phone className="size-5" strokeWidth={1.5} />
            {t("callOffice")}
          </a>
        )}
      </div>
    );
  }

  if (!trip) return null;

  const mapsUrl = (q: string | null) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q ?? "")}`;

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      {/* Language: three taps, always reachable, never buried in a menu. */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="font-mono text-sm font-medium">{trip.lr_no}</span>
        <div className="flex gap-1">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLang(l.code);
                localStorage.setItem("lang-touched", "1");
              }}
              className={`rounded px-2 py-1 text-xs ${
                lang === l.code ? "bg-primary text-primary-foreground" : "text-neutral-600"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-4 p-4">
        {/* Route */}
        <div className="space-y-3 rounded-[10px] border p-4">
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-5 shrink-0 text-neutral-400" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-neutral-500">{t("from")}</p>
              <p className="font-medium">{trip.from_city}</p>
              {trip.from_address && (
                <p className="text-sm text-neutral-600">{trip.from_address}</p>
              )}
              <a
                href={mapsUrl(trip.from_address ?? trip.from_city)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-sm text-primary underline"
              >
                {t("navigate")}
              </a>
            </div>
          </div>

          <div className="flex items-start gap-3 border-t pt-3">
            <MapPin className="mt-0.5 size-5 shrink-0 text-neutral-400" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-neutral-500">{t("to")}</p>
              <p className="font-medium">{trip.to_city}</p>
              {trip.to_address && <p className="text-sm text-neutral-600">{trip.to_address}</p>}
              <a
                href={mapsUrl(trip.to_address ?? trip.to_city)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-sm text-primary underline"
              >
                {t("navigate")}
              </a>
            </div>
          </div>
        </div>

        {/* Cargo */}
        <div className="flex items-center gap-3 rounded-[10px] border p-4 text-sm">
          <Package className="size-5 shrink-0 text-neutral-400" strokeWidth={1.5} />
          <div>
            <p className="font-medium">{trip.cargo}</p>
            <p className="text-neutral-600">
              {trip.packages} {trip.packages_unit}
              {trip.weight_kg ? ` · ${(trip.weight_kg / 1000).toFixed(1)} t` : ""}
            </p>
          </div>
          {trip.vehicle_no && (
            <span className="ml-auto flex items-center gap-1.5 font-mono text-sm">
              <Truck className="size-4 text-neutral-400" strokeWidth={1.5} />
              {trip.vehicle_no}
            </span>
          )}
        </div>

        {trip.instructions && (
          <p className="rounded-[10px] bg-amber-50 p-3 text-sm text-amber-900">
            {trip.instructions}
          </p>
        )}

        {/* Completed steps */}
        {(trip.milestones_done?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {trip.milestones_done.map((m) => (
              <span
                key={m}
                className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700"
              >
                <Check className="size-3" strokeWidth={2} />
                {t(m as TranslationKey)}
              </span>
            ))}
          </div>
        )}

        {/* POD */}
        <div className="space-y-2 rounded-[10px] border p-4">
          <p className="text-sm font-medium">{t("pod")}</p>
          {trip.pod_count > 0 && (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700">
              <Check className="size-4" strokeWidth={2} />
              {trip.pod_count} {t("pages")} ·{" "}
              {queue.pending > 0 ? t("podQueued") : t("podUploaded")}
            </p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={onPhoto}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="touch-target flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-neutral-300 text-neutral-700"
          >
            <Camera className="size-5" strokeWidth={1.5} />
            {trip.pod_count > 0 ? t("addPage") : t("takePhoto")}
          </button>
        </div>

        <button
          onClick={() => setShowExpense((s) => !s)}
          className="flex items-center gap-1.5 text-sm text-primary underline"
        >
          <Plus className="size-4" strokeWidth={1.5} />
          {t("addExpense")}
        </button>

        {showExpense && (
          <ExpenseForm
            t={t}
            onSubmit={async (kind, amount, litres) => {
              await queue.add({
                id: crypto.randomUUID(),
                token,
                kind: "expense",
                payload: { kind, amount, litres: litres ?? null },
              });
              setShowExpense(false);
            }}
          />
        )}
      </div>

      {/* One primary action, pinned, thumb-sized. */}
      {next && (
        <div className="sticky bottom-0 border-t bg-white p-4">
          <button
            onClick={() => recordMilestone(next)}
            className="touch-target w-full rounded-md bg-primary text-lg font-medium text-primary-foreground active:opacity-90"
          >
            {t(next as TranslationKey)}
          </button>
          <p className="mt-2 text-center text-xs text-neutral-500">{t("tapNext")}</p>
        </div>
      )}

      {!next && justDid && (
        <div className="sticky bottom-0 flex items-center justify-center gap-2 border-t bg-emerald-50 p-4 text-emerald-800">
          <Check className="size-5" strokeWidth={2} />
          {t("allDone")}
        </div>
      )}

      <QueueBanner state={queue} onRetry={queue.retry} t={t} />
    </div>
  );
}

function ExpenseForm({
  t,
  onSubmit,
}: {
  t: (k: TranslationKey) => string;
  onSubmit: (kind: string, amount: number, litres?: number) => Promise<void>;
}) {
  const [kind, setKind] = useState<string>("diesel");
  const [amount, setAmount] = useState("");
  const [litres, setLitres] = useState("");

  return (
    <div className="space-y-3 rounded-[10px] border p-4">
      <div className="grid grid-cols-3 gap-2">
        {EXPENSE_KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-md border py-2 text-sm ${
              kind === k ? "border-primary bg-primary text-primary-foreground" : "text-neutral-700"
            }`}
          >
            {t(k as TranslationKey)}
          </button>
        ))}
      </div>

      <input
        type="number"
        inputMode="decimal"
        placeholder={t("amount")}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="h-12 w-full rounded-md border px-3"
      />

      {kind === "diesel" && (
        <input
          type="number"
          inputMode="decimal"
          placeholder={t("litres")}
          value={litres}
          onChange={(e) => setLitres(e.target.value)}
          className="h-12 w-full rounded-md border px-3"
        />
      )}

      <button
        disabled={!amount}
        onClick={() => onSubmit(kind, Number(amount), litres ? Number(litres) : undefined)}
        className="touch-target w-full rounded-md bg-primary font-medium text-primary-foreground disabled:opacity-40"
      >
        {t("save")}
      </button>
    </div>
  );
}
