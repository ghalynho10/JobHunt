import type { CookieMethodsServer } from "@supabase/ssr";

/**
 * An in memory stand in for the browser's cookie store (spec 0004, AC-1).
 *
 * This is what lets a test drive `createClient()` from `src/lib/supabase/server.ts`
 * without a request. It is deliberately NOT a Supabase client of its own: the
 * jar holds cookies and nothing else, so every decision about what a session is
 * and how it is stored stays inside the application's own module, where a break
 * in that wiring breaks the test.
 *
 * One jar is one browser. Two jars are two users, which is the whole isolation
 * proof.
 */
export interface CookieJar extends CookieMethodsServer {
  /** The cookie names currently held, for asserting a session actually landed. */
  readonly names: () => readonly string[];
}

export function createCookieJar(): CookieJar {
  const cookies = new Map<string, string>();

  return {
    getAll() {
      return [...cookies].map(([name, value]) => ({ name, value }));
    },
    /**
     * The real adapter receives cache control headers as a second argument and
     * puts them on the HTTP response. There is no response here, so they are
     * ignored: nothing in this process caches, and the parameter is left off
     * rather than accepted and dropped silently.
     */
    setAll(cookiesToSet) {
      for (const { name, value } of cookiesToSet) {
        /**
         * An empty value is how the auth client deletes a cookie, so it is
         * removed rather than stored as an empty string. Keeping it would leave
         * a signed out jar looking like it still held a session.
         */
        if (value === "") {
          cookies.delete(name);
          continue;
        }
        cookies.set(name, value);
      }
    },
    names() {
      return [...cookies.keys()];
    },
  };
}
