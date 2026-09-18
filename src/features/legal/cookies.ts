/**
 * Every cookie this app can set, as a typed registry (spec 0009, AC-14, AC-24).
 *
 * THE SAME SHAPE AS `recipients.ts` AND `stored-fields.ts`, POINTED AT A THIRD
 * CLAIM THAT HAD NO DRIFT GUARD OF ITS OWN. `/privacy` stated "one cookie is
 * set" while the codebase set three kinds, and nothing failed when the second
 * arrived (spec 0008). This registry, `cookies.test.ts`'s source scan, and the
 * integration test in `test/integration/` are what make a fourth cookie fail a
 * test rather than quietly falsify a public legal page again.
 *
 * ONLY A CALL SITE THAT CAN PUT A `Set-Cookie` HEADER ON A REAL RESPONSE
 * BELONGS HERE. `src/features/demo/refresh-session.ts`'s session jar is a plain
 * `Map`, never an HTTP cookie store, and `src/lib/supabase/read-only-cookies.ts`
 * deliberately writes nothing at all; neither is a cookie, and neither is named
 * below. See the spec's Feature design for the near miss this correction found
 * before it shipped.
 */

/** One cookie this app can set, and the plain words the notice uses for it. */
export interface CookieDisclosure {
  /** Stable key, used for render order and by the guard tests. */
  readonly id: string;
  /**
   * A literal cookie name, or a documented pattern for one a library names at
   * runtime. Descriptive prose only, like `DataRecipient`'s `receives`/`why`:
   * asserted non empty by the guard tests, never fact checked against a real
   * response name by either of them.
   */
  readonly namePattern: string;
  /**
   * Every call site that can produce this cookie's `Set-Cookie` header, as
   * `file:line`. A list because one cookie can be written from more than one
   * place: the session cookie is refreshed by both `src/proxy.ts` and the per
   * request adapter in `src/lib/supabase/server.ts`.
   */
  readonly setBy: readonly string[];
  /**
   * The full sentence `/privacy` renders for this cookie. Written to stand on
   * its own, since the page renders these in order with no added connective
   * text.
   */
  readonly purpose: string;
  /**
   * Plain words, for completeness rather than for rendering: the page's own
   * sentence in `purpose` already carries this naturally. The session cookie's
   * real expiry is Supabase project configuration, outside `src/`, so this
   * names what is known rather than a value either guard test can read.
   */
  readonly lifetime: string;
}

/**
 * Every cookie this app can set (AC-14), in the order `/privacy` lists them.
 */
export const COOKIE_DISCLOSURES: readonly CookieDisclosure[] = [
  {
    id: "session",
    namePattern:
      "sb-<project-ref>-auth-token, chosen at runtime by @supabase/ssr and occasionally split into numbered chunks",
    setBy: ["src/proxy.ts:144", "src/lib/supabase/server.ts:59"],
    purpose:
      "The first keeps you signed in as you move between pages. Without it, signing in would not survive a single click.",
    lifetime: "For as long as you are signed in.",
  },
  {
    id: "pkce-verifier",
    namePattern:
      "<storageKey>-code-verifier, and per sign in attempt <storageKey>-flow-<flowId>-code-verifier plus a <storageKey>-flows-code-verifier index, all chosen at runtime by @supabase/ssr",
    setBy: ["src/lib/supabase/server.ts:59"],
    purpose:
      "The second exists only for the few seconds it takes to hand you off to Google or GitHub to sign in, and is gone again the moment that finishes. It is part of how that handoff is done safely.",
    lifetime:
      "A few minutes at most, only while a sign in handshake with the provider is in progress.",
  },
  {
    id: "return-path",
    namePattern: "jobhunt_return_path",
    setBy: [
      "src/features/auth/actions.ts:134",
      "src/app/auth/callback/route.ts:73",
    ],
    purpose:
      "The third exists only if you followed a link to a page that needs signing in while you were signed out. It remembers where you were headed, for a few minutes at most, so signing in returns you there instead of somewhere generic, and it is removed the moment it has done that job.",
    lifetime: "10 minutes at most, and cleared as soon as sign in finishes.",
  },
];
