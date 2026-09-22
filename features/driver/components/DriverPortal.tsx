"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera, Check, MapPin, Phone, Plus, Truck, Package, Loader2, AlertTriangle,
} from "lucide-react";
import { useI18n, LANGS, type Lang, type TranslationKey } from "../hooks/useI18n";
import { useUploadQueue } from "../hooks/useUploadQueue";
import { QueueBanner } from "./QueueBanner";
import { compressForPod } from "../utils/compress-image";
import { newId } from "../utils/id";
import { nextMilestone, type Milestone } from "@/lib/consignments/state-machine";
import { Mark } from "@/components/brand/Mark";

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
    // queue.add() throws when the tap never even made it into storage —
    // Safari Private Browsing refusing IndexedDB is the real-world case.
    // The optimistic update below must not run for that: showing a green
    // checkmark for a step that was not saved anywhere, on-device or off, is
    // worse than showing nothing, because the driver then has no reason to
    // ever try again. queue.dbError (rendered below) is the visible signal
    // instead of silence.
    try {
      await queue.add({
        id: newId(),
        token,
        kind: "milestone",
        payload: { kind, at: new Date().toISOString() },
      });
    } catch {
      return;
    }
    setJustDid(kind);
    // Optimistic: the driver must see the step complete even with no signal.
    setTrip((prev) =>
      prev ? { ...prev, milestones_done: [...(prev.milestones_done ?? []), kind] } : prev,
    );
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    let saved = 0;
    for (const [i, file] of files.entries()) {
      const blob = await compressForPod(file);
      try {
        await queue.add({
          id: newId(),
          token,
          kind: "pod",
          payload: { page_no: (trip?.pod_count ?? 0) + i + 1 },
          blob,
          mime: "image/jpeg",
        });
        saved += 1;
      } catch {
        break; // dbError is now set; stop rather than lose more silently
      }
    }
    if (saved === 0) return;
    setTrip((prev) =>
      prev ? { ...prev, pod_count: prev.pod_count + saved } : prev,
    );
    setJustDid("pod");
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-3">
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
        {/* The driver opened this from a WhatsApp message; the mark is what
            tells him it is the same system his office uses. */}
        <span className="flex items-center gap-2">
          <Mark className="size-4 text-indigo-ink" aria-hidden />
          <span className="font-mono text-sm font-medium">{trip.lr_no}</span>
        </span>
        <div className="flex gap-1">
          {LANGS.map((l) => (
            <button
              key={l.code}
              onClick={() => {
                setLang(l.code);
                localStorage.setItem("lang-touched", "1");
              }}
              className={`rounded px-2 py-1 text-xs ${
                lang === l.code ? "bg-primary text-primary-foreground" : "text-ink-2"
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
            <MapPin className="mt-0.5 size-5 shrink-0 text-ink-3" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-3">{t("from")}</p>
              <p className="font-medium">{trip.from_city}</p>
              {trip.from_address && (
                <p className="text-sm text-ink-2">{trip.from_address}</p>
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
            <MapPin className="mt-0.5 size-5 shrink-0 text-ink-3" strokeWidth={1.5} />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-ink-3">{t("to")}</p>
              <p className="font-medium">{trip.to_city}</p>
              {trip.to_address && <p className="text-sm text-ink-2">{trip.to_address}</p>}
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
          <Package className="size-5 shrink-0 text-ink-3" strokeWidth={1.5} />
          <div>
            <p className="font-medium">{trip.cargo}</p>
            <p className="text-ink-2">
              {trip.packages} {trip.packages_unit}
              {trip.weight_kg ? ` · ${(trip.weight_kg / 1000).toFixed(1)} t` : ""}
            </p>
          </div>
          {trip.vehicle_no && (
            <span className="ml-auto flex items-center gap-1.5 font-mono text-sm">
              <Truck className="size-4 text-ink-3" strokeWidth={1.5} />
              {trip.vehicle_no}
            </span>
          )}
        </div>

        {trip.instructions && (
          <p className="rounded-[10px] bg-marigold-tint p-3 text-sm text-marigold-ink">
            {trip.instructions}
          </p>
        )}

        {/* Completed steps */}
        {(trip.milestones_done?.length ?? 0) > 0 && (
          <div className="flex flex-wrap gap-2">
            {trip.milestones_done.map((m) => (
              <span
                key={m}
                className="flex items-center gap-1 rounded-full bg-forest-tint px-2.5 py-1 text-xs text-forest-ink"
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
            <p className="flex items-center gap-1.5 text-sm text-forest-ink">
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
            className="touch-target flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-line text-ink-2"
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
              try {
                await queue.add({
                  id: newId(),
                  token,
                  kind: "expense",
                  payload: { kind, amount, litres: litres ?? null },
                });
              } catch {
                return; // dbError is now set; leave the form open, not lost
              }
              setShowExpense(false);
            }}
          />
        )}
      </div>

      {/*
        One pinned bottom bar, never two. It used to be the action button and
        QueueBanner as separate sticky siblings, each pinned to the viewport
        edge — harmless on a tall desktop test window, but on a real phone
        (shorter effective viewport once the browser's own address bar takes
        its share) their combined height ran past the bottom of the screen.
        The banner, being later in the DOM, ended up covering the actual
        button: a driver's tap landed on inert banner space, which is exactly
        what "the button doesn't work" looks like from the driver's seat, with
        nothing to see in a console they don't have. Folding the send/fail
        state into the one row the button already occupies makes that
        overflow impossible — there is only ever one thing pinned here.
      */}
      {next && (
        <div className="sticky bottom-0 border-t bg-white p-4">
          {queue.dbError ? (
            // The tap never reached storage at all — most often Safari
            // Private Browsing refusing IndexedDB. This sits ahead of
            // `failed` on purpose: a failed job was at least saved; this
            // one was not saved anywhere, so it needs the plainest possible
            // instruction rather than a generic error.
            <div className="rounded-md bg-alert-tint px-4 py-3 text-sm text-alert">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle className="size-4 shrink-0" strokeWidth={1.5} />
                {t("storageBlocked")}
              </p>
              <button
                onClick={() => recordMilestone(next)}
                className="touch-target mt-2 w-full rounded-md bg-alert text-sm font-medium text-white"
              >
                {t("tryAgain")}
              </button>
            </div>
          ) : queue.failed > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-md bg-marigold-tint px-4 py-3 text-sm text-marigold-ink">
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" strokeWidth={1.5} />
                {queue.failed} {t("failed")}
              </span>
              <button
                onClick={queue.retry}
                className="touch-target rounded-md bg-marigold-ink px-4 text-sm font-medium text-white"
              >
                {t("retry")}
              </button>
            </div>
          ) : (
            <button
              onClick={() => recordMilestone(next)}
              disabled={queue.pending > 0}
              className="touch-target flex w-full items-center justify-center gap-2 rounded-md bg-primary text-lg font-medium text-primary-foreground active:opacity-90 disabled:opacity-70"
            >
              {queue.pending > 0 && <Loader2 className="size-5 animate-spin" strokeWidth={2} />}
              {queue.pending > 0 ? t("sending") : t(next as TranslationKey)}
            </button>
          )}
          <p className="mt-2 text-center text-xs text-ink-3">
            {queue.dbError || queue.failed > 0
              ? ""
              : queue.pending > 0
                ? (queue.online ? "" : t("offline"))
                : t("tapNext")}
          </p>
        </div>
      )}

      {!next && justDid && (
        <div className="sticky bottom-0 flex items-center justify-center gap-2 border-t bg-forest-tint p-4 text-forest-ink">
          <Check className="size-5" strokeWidth={2} />
          {t("allDone")}
        </div>
      )}

      {/* Once every milestone is recorded, nothing else competes for this
          space — a lingering POD or expense upload gets the full banner. */}
      {!next && <QueueBanner state={queue} onRetry={queue.retry} t={t} />}
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
              kind === k ? "border-primary bg-primary text-primary-foreground" : "text-ink-2"
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
