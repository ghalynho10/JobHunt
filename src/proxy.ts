import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";
import { RETURN_PATH_HEADER, RETURN_PATH_MAX_LENGTH } from "@/lib/return-path";

/**
 * BINDING RULE 6 (spec 0001, amended 2026-08-31 by spec 0008): authorisation is
 * never decided here.
 *
 * This does exactly two things, and the list is closed. It refreshes the
 * Supabase session cookie, and it echoes the requested path back upstream as a
 * request header so the layout that redirects an unauthenticated visitor can
 * remember where they were going. It never redirects on a missing session and
 * never decides who may see what. The protected layout verifies the session,
 * every Server Action verifies its own caller independently (a Server Action is
 * a callable endpoint whatever page renders it), and row level security in
 * Postgres is the guarantee behind both.
 *
 * THE SECOND JOB CANNOT BECOME THE FIRST ONE. The header is set on every request
 * the matcher covers, unconditionally. This file reads no session, holds no list
 * of routes, and cannot tell a protected path from a public one, which is what
 * `src/proxy.test.ts` lines 49 to 70 assert and spec 0008 AC-9 keeps true.
 *
 * In Next.js 16 this file is `proxy.ts`, not `middleware.ts`, and it runs on the
 * Node runtime.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: forwardedHeaders(request) },
  });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          /**
           * SPEC 0008, AC-10: the headers are re-derived HERE, after the loop
           * above, and never hoisted out of this function.
           *
           * The object handed to `NextResponse.next({ request: { headers } })`
           * is read once, at construction, and copied onto the response as
           * internal forwarding headers. It is a snapshot, not a live view, and
           * `request.cookies.set()` writes through to the request's own `cookie`
           * header. So one `Headers` built before this loop and reused by
           * reference would carry the pathname and the OLD cookie: this
           * request's Server Components would read a stale session while the
           * browser received a fresh one, and nothing would report it.
           */
          response = NextResponse.next({
            request: { headers: forwardedHeaders(request) },
          });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }

          // A response that sets auth cookies must not be cached by a CDN or a
          // reverse proxy, or one user's token can be served to another user.
          // The library hands us the headers that prevent it.
          for (const [header, value] of Object.entries(headers)) {
            response.headers.set(header, value);
          }
        },
      },
    },
  );

  // Touching the session is what triggers the refresh and the cookie write.
  // The answer is deliberately ignored: deciding on it here would be an
  // authorisation decision, which binding rule 6 forbids in this file.
  await supabase.auth.getClaims();

  return response;
}

/**
 * The request's own headers, plus the requested path (spec 0008, AC-8).
 *
 * UPSTREAM ONLY. It is set through `NextResponse.next({ request: { headers } })`
 * and never `NextResponse.next({ headers })`, so the value travels to this
 * application's own Server Components and is never exposed to the browser.
 *
 * IT IS ALWAYS `set` OR `delete`, NEVER APPENDED. A client can send a header of
 * this name, so a value that arrived on the request is overwritten before
 * anything reads it, and removed outright when this request has nothing to put
 * there.
 *
 * OVER THE CAP IT IS OMITTED, NOT TRUNCATED. A truncated path is a valid looking
 * wrong destination that the validator would accept, so the visitor would land
 * somewhere plausible and incorrect with nothing reporting it. Omitting it falls
 * through to the landing rule, which is the honest outcome. The cap is shared
 * with the validator, so one number governs both ends.
 */
function forwardedHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  const requested = `${request.nextUrl.pathname}${request.nextUrl.search}`;

  if (requested.length > RETURN_PATH_MAX_LENGTH) {
    headers.delete(RETURN_PATH_HEADER);

    return headers;
  }

  headers.set(RETURN_PATH_HEADER, requested);

  return headers;
}

export const config = {
  matcher: [
    /**
     * Everything except static assets and image files. Those carry no session
     * and refreshing on them would be wasted work on every page load.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
