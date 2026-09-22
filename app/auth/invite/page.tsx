"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Lands a customer-portal invite. Not `/auth/callback` (that route.ts only
 * ever sees a `?code=` — the PKCE flow signInWithOtp produces, because the
 * browser generated the code_verifier itself). auth.admin.inviteUserByEmail
 * runs server-side with no browser and no code_verifier to pair with, so
 * Supabase Auth can only give it the older implicit flow: a
 * `#access_token=...&refresh_token=...&type=invite` URL FRAGMENT, which —
 * being a fragment — never reaches the server at all.
 *
 * This page parses that fragment itself and calls setSession() explicitly,
 * rather than relying on the browser client's detectSessionInUrl: `@supabase
 * /ssr`'s browser client is built around writing the PKCE code-exchange
 * result into cookies the SERVER can read, and does not reliably do the same
 * from a bare hash fragment — confirmed directly (the redirect this produced
 * without an explicit setSession() call bounced forever between /customer
 * and /customer/login, because the server-side layout's session check and
 * the client's post-redirect check disagreed about whether a session existed
 * at all). setSession() forces the write through that same storage adapter,
 * so the very next server request sees it.
 *
 * Every invite this codebase sends today is a customer-portal invite (see
 * app/api/parties/[id]/invite-customer) — nothing else uses
 * inviteUserByEmail — so redirecting straight to /customer afterward is not
 * a shortcut, it is the one real destination.
 */
export default function AcceptInvitePage() {
  const router = useRouter();
  const [status, setStatus] = useState<"waiting" | "error">("waiting");

  useEffect(() => {
    Promise.resolve().then(async () => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");

      if (!access_token || !refresh_token) {
        setStatus("error");
        return;
      }

      const supabase = createClient();
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) {
        setStatus("error");
        return;
      }
      router.replace("/customer");
    });
  }, [router]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-paper px-6 text-center">
      {status === "waiting" ? (
        <p className="text-sm text-ink-3">Signing you in…</p>
      ) : (
        <p className="text-sm text-ink-3">
          That invite link didn&apos;t work — ask your transporter to send a new one.
        </p>
      )}
    </div>
  );
}
