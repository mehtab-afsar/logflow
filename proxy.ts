import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { rateLimit, clientIp, LIMITS } from "@/lib/rate-limit";

/**
 * Refreshes the Supabase session cookie and guards the authenticated area.
 *
 * Three deliberate choices:
 *
 *  1. PUBLIC_PREFIXES short-circuits before any Supabase call. The landing
 *     page, the pilot setup wizard, the driver portal and the customer
 *     tracking page must not pay an auth round trip — tracking in particular
 *     is opened on a 3G phone in a WhatsApp browser and has a sub-second
 *     budget.
 *
 *  2. getUser(), never getSession(). getSession trusts the cookie without
 *     revalidating it.
 *
 *  3. withTimeout around the auth call. A slow auth server must not hang the
 *     whole site, and a timeout must be distinguishable from "no session" —
 *     we never bounce a signed-in user away because Supabase was briefly slow.
 */

// "/start" is the onboarding wizard; there is no "/login" route yet.
const PUBLIC_PATHS = new Set(["/", "/start", "/auth/callback"]);

/**
 * Public prefixes short-circuit before any Supabase call.
 *
 * The metadata files matter as much as the pages: redirecting robots.txt or
 * manifest.json into a redirect makes a crawler treat the site as an auth wall, and
 * an iOS home-screen install silently fails when its icon 307s.
 */
const PUBLIC_PREFIXES = [
  "/track/", "/d/", "/api/d/", "/api/track/", "/api/dev/",
  "/_next/", "/favicon", "/icon", "/apple-icon", "/apple-touch-icon",
  "/robots.txt", "/sitemap.xml", "/manifest.webmanifest", "/manifest.json",
  "/.well-known/",
];

const TIMED_OUT = Symbol("timed-out");

async function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<typeof TIMED_OUT>((resolve) => setTimeout(() => resolve(TIMED_OUT), ms)),
  ]);
}

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Throttle the unauthenticated write paths.
  if (pathname.startsWith("/api/d/")) {
    const limit = rateLimit(`d:${clientIp(request.headers)}`, LIMITS.driverApi, 60_000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
  }
  if (pathname.startsWith("/track/")) {
    const limit = rateLimit(`t:${clientIp(request.headers)}`, LIMITS.tracking, 60_000);
    if (!limit.ok) {
      return new NextResponse("Too many requests", { status: 429 });
    }
  }

  if (isPublic(pathname)) return NextResponse.next();

  let response = NextResponse.next({ request: { headers: request.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request: { headers: request.headers } });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const result = await withTimeout(supabase.auth.getUser(), 5_000);

  // A timeout is not a signed-out user. Let the request through rather than
  // bouncing someone away because the auth server was briefly slow.
  if (result === TIMED_OUT) return response;

  let user = result.data.user;

  // API routes do their own authorisation and must get JSON, never a redirect.
  // This sits ABOVE the dev bypass on purpose: a convenience for browsing pages
  // must never silently authenticate an API call, or the end-to-end suite would
  // stop testing the real authorisation boundary.
  if (pathname.startsWith("/api/")) return response;

  // ─── Local convenience: sign in automatically ─────────────────────────────
  //
  // Triple-gated, because an auth bypass that reaches production is the worst
  // bug this codebase could ship:
  //   1. NODE_ENV must not be production — Vercel always sets it to production
  //   2. DEV_AUTO_LOGIN must be explicitly set to "1"
  //   3. the credentials must be supplied; nothing is hardcoded here
  // __tests__/dev-auth-guard.test.ts asserts all three remain in place.
  if (
    !user &&
    process.env.NODE_ENV !== "production" &&
    process.env.DEV_AUTO_LOGIN === "1" &&
    process.env.DEV_AUTO_LOGIN_EMAIL &&
    process.env.DEV_AUTO_LOGIN_PASSWORD
  ) {
    const signIn = await withTimeout(
      supabase.auth.signInWithPassword({
        email: process.env.DEV_AUTO_LOGIN_EMAIL,
        password: process.env.DEV_AUTO_LOGIN_PASSWORD,
      }),
      5_000,
    );
    // setAll() has already written the session cookies onto `response`.
    if (signIn !== TIMED_OUT && signIn.data.user) user = signIn.data.user;
  }

  if (!user) {
    // There is no login screen yet — onboarding is a later phase. Send an
    // unauthenticated visitor to the landing page rather than a route that
    // does not exist.
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
