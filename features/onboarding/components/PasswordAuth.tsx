"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Email + password, no magic link, no confirmation email — beta-stage
 * decision (see app/api/auth/signup/route.ts). Replaces EmailSignIn at the
 * two self-serve entry points (/login, /start's own first step).
 *
 * EmailSignIn itself is untouched and still used for /customer/login: a
 * customer account is staff-provisioned via invite (no password exists for
 * it to sign in with), so this component does not apply there.
 *
 * Sign-up: POST /api/auth/signup creates the account (already confirmed,
 * server-side, via the admin API), then this component calls
 * signInWithPassword() itself — the route never hands back a session.
 * Sign-in: signInWithPassword() directly, no round trip needed.
 */
export function PasswordAuth({
  mode,
  next,
  heading,
  reason,
}: {
  mode: "signup" | "signin";
  next: string;
  heading: string;
  reason: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("busy");
    setError("");

    const supabase = createClient();

    if (mode === "signup") {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus("error");
        setError(json.error ?? "Could not create your account");
        return;
      }
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setStatus("error");
      setError(
        mode === "signup"
          ? "Account created, but signing you in failed — try signing in below."
          : "That email and password don't match.",
      );
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <h1 className="text-[28px] leading-[1.15] font-semibold tracking-[-0.01em] text-ink">
        {heading}
      </h1>
      <p className="mt-2.5 max-w-[52ch] text-[14px] leading-[1.55] text-ink-2">{reason}</p>

      <div className="mt-8 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-ink">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-3 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-indigo-ink"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-ink">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
            className="w-full rounded-md border border-line bg-white px-3 py-2.5 text-[14px] text-ink placeholder:text-ink-3 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-indigo-ink"
          />
        </div>
        {status === "error" && <p className="text-[12.5px] text-alert">{error}</p>}
      </div>

      <button
        type="submit"
        disabled={status === "busy"}
        className="mt-6 rounded-md bg-indigo-ink px-5 py-3 text-[14px] font-medium text-white transition-colors duration-150 hover:bg-indigo-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-ink disabled:cursor-not-allowed disabled:bg-ink-3"
      >
        {status === "busy"
          ? mode === "signup" ? "Creating your account…" : "Signing in…"
          : mode === "signup" ? "Create account" : "Sign in"}
      </button>

      <p className="mt-4 text-[12.5px] leading-[1.5] text-ink-3">
        {mode === "signup"
          ? "No email to check — you're straight in."
          : "Straight in — no email to check."}
      </p>
    </form>
  );
}
