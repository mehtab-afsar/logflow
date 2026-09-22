import { expect } from "@playwright/test";

/**
 * Reads the magic-link email Supabase Auth sends through the local dev SMTP
 * catcher (Mailpit, port 54344 in this project's shifted config) and returns
 * the sign-in URL inside it.
 *
 * This exists so the onboarding journey test exercises the REAL path a new
 * customer takes — an email with a working link — rather than the dev
 * session-switcher shortcut every other spec uses. That shortcut is correct
 * for testing what happens after sign-in; it cannot catch a broken magic
 * link, because it never sends one.
 */
const MAILPIT_URL = "http://127.0.0.1:54344";

export async function waitForMagicLink(email: string, after: Date): Promise<string> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=25`);
    const body = await res.json();
    const hit = (body.messages ?? []).find(
      (m: { To: { Address: string }[]; Created: string; ID: string }) =>
        m.To?.some((t) => t.Address.toLowerCase() === email.toLowerCase()) &&
        new Date(m.Created) >= after,
    );
    if (hit) {
      const full = await (await fetch(`${MAILPIT_URL}/api/v1/message/${hit.ID}`)).json();
      const text = full.Text ?? full.HTML ?? "";
      const match = text.match(/https?:\/\/[^\s)]+verify\?[^\s)]+/);
      if (match) return match[0].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No sign-in email reached Mailpit for ${email} within 20s`);
}

/** Fails loudly, with the reason, instead of a bare timeout three steps later. */
export async function expectMagicLink(email: string, after: Date): Promise<string> {
  const link = await waitForMagicLink(email, after);
  expect(link, "magic-link URL shape").toContain("/auth/v1/verify");
  return link;
}
