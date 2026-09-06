import "server-only";

import type { CookieMethodsServer } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * A cookie adapter that reads the session and refuses to write one (spec 0014,
 * AC-20).
 *
 * THIS IS A BUDGET MEASURE, NOT A SECURITY ONE, and the distinction matters
 * because the name reads like the latter. Writing a cookie inside a Server
 * Action puts a re-render of the CURRENT route into the action's response
 * (verified in the installed Next.js 16.3.1 docs,
 * `node_modules/next/dist/docs/01-app/02-guides/server-actions.md:47`, which
 * lists a cookie mutation as one of the five triggers). On `/search` that
 * re-render re-runs `searchListings()`, which spends one of the 25 Adzuna calls
 * this account gets per week (spec 0011).
 *
 * SO THE DANGER IS NOT A LINE ANYONE WOULD WRITE. `recordApplication` verifies
 * its own caller (binding rule 6) through the ordinary Supabase server client,
 * whose default adapter DOES write: `src/lib/supabase/server.ts` calls
 * `cookieStore.set` inside a try block whose catch comment notes that a Server
 * Component cannot write cookies, which is exactly an admission that a Server
 * Action can. If that caller check refreshes an expired access token, the
 * refreshed cookie is written, the route re-renders, and a call is spent. It
 * would fire only for a reader whose tab sat idle past token expiry, so a
 * measurement taken on a fresh session passes straight over it.
 *
 * NOTHING IS LOST BY REFUSING THE WRITE. `src/proxy.ts` refreshes the session
 * on every request, which is the same thing the default adapter's own catch
 * block already relies on for every Server Component in this app. The refusal
 * is silent for that reason: there is nothing here to report.
 *
 * USE THIS ONLY WHERE A RE-RENDER WOULD COST SOMETHING. Every other action in
 * this app should keep the default adapter; a read only adapter everywhere
 * would be cargo cult, and the session would still refresh, so nothing would
 * look wrong until something did.
 */
export async function readOnlyCookieAdapter(): Promise<CookieMethodsServer> {
  const cookieStore = await cookies();

  return {
    getAll() {
      return cookieStore.getAll();
    },
    /**
     * Deliberately empty. See the header: the proxy owns the refresh, and a
     * write here would re-render `/search` and spend an Adzuna call.
     */
    setAll() {},
  };
}
