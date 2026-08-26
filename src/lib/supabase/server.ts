import "server-only";

import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";

import { env } from "@/env";

import type { Database } from "./database.types";

/**
 * The request scoped server client. Every read and write goes through this.
 *
 * It carries the caller's own token, so row level security applies by
 * construction: there is no code path here that can quietly bypass a policy.
 * Never share one across requests, so this builds a new client each call.
 *
 * @param cookieAdapter Where the session cookies are read from and written to.
 * Defaults to the `next/headers` store, which is every caller in `src/`, and is
 * the only thing this parameter changes.
 *
 * SPEC 0004: the parameter exists so a test can drive THIS module, the same one
 * every page and Server Action drives, with an in memory jar instead of a
 * request. The alternative was a second Supabase client hand built in test
 * code, which would be exactly the mock encoding the same assumption as the
 * code under test that the test foundation exists to make impossible: a break
 * in this wiring would leave the parallel implementation passing.
 *
 * This is production code shaped by testability, which is worth naming rather
 * than hiding. It is optional, no existing caller changes, and behaviour with
 * the parameter absent is byte for byte what it was before.
 */
export async function createClient(cookieAdapter?: CookieMethodsServer) {
  const cookieMethods = cookieAdapter ?? (await nextCookieAdapter());

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { cookies: cookieMethods },
  );
}

/**
 * The default adapter, reading the real request's cookie store.
 *
 * Split out so that `cookies()` is only awaited when it is actually going to be
 * used. Calling it unconditionally would throw outside a request scope, which
 * is precisely where an injected adapter is passed.
 */
async function nextCookieAdapter(): Promise<CookieMethodsServer> {
  const cookieStore = await cookies();

  return {
    getAll() {
      return cookieStore.getAll();
    },
    setAll(cookiesToSet) {
      try {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // A Server Component cannot write cookies. That is fine here:
        // src/proxy.ts refreshes the session on every request, so the
        // refreshed cookie is already on its way back to the browser.
      }
    },
  };
}
