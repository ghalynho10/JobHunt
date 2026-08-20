import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/env";

/**
 * BINDING RULE 6 (spec 0001): authorisation is never decided here.
 *
 * This refreshes the Supabase session cookie and does nothing else. It never
 * redirects on a missing session and never decides who may see what. The
 * protected layout verifies the session, every Server Action verifies its own
 * caller independently (a Server Action is a callable endpoint whatever page
 * renders it), and row level security in Postgres is the guarantee behind both.
 *
 * In Next.js 16 this file is `proxy.ts`, not `middleware.ts`, and it runs on the
 * Node runtime.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

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

          response = NextResponse.next({ request });

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

export const config = {
  matcher: [
    /**
     * Everything except static assets and image files. Those carry no session
     * and refreshing on them would be wasted work on every page load.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
