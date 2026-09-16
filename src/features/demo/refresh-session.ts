import "server-only";

import type { CookieMethodsServer } from "@supabase/ssr";

import {
  attempt,
  failure,
  isFailure,
  success,
  type Result,
} from "@/lib/result";
import { createClient } from "@/lib/supabase/server";
import { createSecretClient } from "@/lib/supabase/secret";

/**
 * The session the `/demo` refresh spends its budget under (spec 0021, AC-18).
 *
 * WHY A SESSION AT ALL. Every paid call this app makes goes through
 * `checkUsageGate()`, which verifies the caller with `getClaims()` and counts
 * the spend against that caller's own account scope window (spec 0011). The
 * refresh makes real paid calls, so it needs a real verified identity or it
 * would have to bypass the gate, and an ungated spender is the one thing spec
 * 0002's whole cost model exists to prevent.
 *
 * WHY A DEDICATED IDENTITY RATHER THAN THE ENGINEER'S OWN. This identity's
 * weekly account scope budget is separate from every real user's, including the
 * engineer's, so a refresh can never consume a person's own search allowance,
 * and a person's searching can never starve a refresh. It holds no `profile`
 * and no `application` row, so a compromise of this path reaches nothing beyond
 * its own capped call budget.
 *
 * THIS IS A PRODUCTION SESSION MINT, WHICH IS NEW IN THIS CODEBASE and worth
 * naming rather than burying. Spec 0001's caller 1 (the test mint in
 * `test/helpers/`) is hard blocked outside development; this one is not, on
 * purpose. What guards it instead is the route's shared secret (AC-18) and the
 * fact that this identity owns nothing. Spec 0021's security model records that
 * as a deliberately accepted, named risk, weighed against the alternative of
 * putting `SUPABASE_SECRET_KEY` on a personal machine for a routine task.
 *
 * `test/helpers/session.ts` IS DELIBERATELY NOT IMPORTED, even though it does
 * the same thing. Root `AGENTS.md` places test helpers outside `src/`
 * specifically so no application module can import one, which is a structural
 * guarantee rather than a filing preference. The technique below is imitated;
 * the code is not shared.
 */

/**
 * The refresh's own identity, at RFC 2606's reserved `.test` domain.
 *
 * A MODULE CONSTANT AND NOT AN ENVIRONMENT VARIABLE. Knowing this address
 * grants nothing on its own: minting a session for it requires
 * `SUPABASE_SECRET_KEY`, which only this feature's own code already holds.
 *
 * THE RESERVED DOMAIN IS LOAD BEARING, the same reasoning
 * `test/helpers/fixture-user.ts` gives for its own addresses. A `.test` address
 * can never resolve to a real mailbox and no real OAuth provider can verify
 * one, so this identity can never collide with a real person's account however
 * anybody signs up.
 */
export const DEMO_REFRESH_EMAIL = "demo-refresh@example.test";

/**
 * An in memory cookie store, so a session can exist without a request.
 *
 * IT IS DELIBERATELY NOT A SUPABASE CLIENT OF ITS OWN. The jar holds cookies
 * and nothing else, so every decision about what a session is and how it is
 * stored stays inside `@supabase/ssr` and `src/lib/supabase/server.ts`, the
 * same modules every real request drives. A hand built client here would be a
 * second implementation of the session, and this refresh would prove that one
 * works while saying nothing about the one that ships.
 */
interface CookieJar extends CookieMethodsServer {
  /** The names currently held, for asserting a session actually landed. */
  readonly names: () => readonly string[];
}

function createCookieJar(): CookieJar {
  const cookies = new Map<string, string>();

  return {
    getAll() {
      return [...cookies].map(([name, value]) => ({ name, value }));
    },
    /**
     * The real adapter receives cache control options as a second argument and
     * puts them on the HTTP response. There is no response here, so they are
     * left off rather than accepted and silently dropped.
     */
    setAll(cookiesToSet) {
      for (const { name, value } of cookiesToSet) {
        /**
         * An empty value is how the auth client deletes a cookie, so it is
         * removed rather than stored as an empty string. Keeping it would
         * leave a signed out jar looking like it still held a session.
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

/**
 * Error codes meaning "this identity already exists", which is success here.
 *
 * VERIFIED 2026-09-14 AGAINST THE INSTALLED `@supabase/auth-js` 2.112.3, whose
 * `ErrorCode` union declares both. The spec described this step as a lookup
 * followed by a create, but that version's admin API exposes no
 * `getUserByEmail` and only a paginated `listUsers`, so scanning pages to learn
 * one address exists would be slower, racier and no more certain than simply
 * creating and accepting the collision. Creating first is also race free: two
 * refreshes overlapping cannot both create the row, and the loser reads one of
 * these codes rather than a corrupted state.
 */
const ALREADY_EXISTS_CODES: readonly string[] = [
  "email_exists",
  "user_already_exists",
];

/**
 * Mints a verified session for the refresh identity, creating it if absent.
 *
 * THE ORDER IS THE CORRECTNESS, and it is `mintSession()`'s order for
 * `mintSession()`'s reasons. The jar is created FIRST, a request scoped client
 * is built from it, and `verifyOtp` is called on THAT client, so `@supabase/ssr`
 * itself writes the real, correctly named and chunked session cookies into the
 * jar. Exchanging the token on some other client and copying cookies across
 * afterwards would be this feature guessing at a cookie format that package
 * owns.
 *
 * THE JAR IS ASSERTED NON EMPTY BEFORE IT IS RETURNED, which is not belt and
 * braces. A client keeps its session in memory as well, so a jar that silently
 * received nothing would still read correctly through the one client built
 * here and fail only in the caller, which builds a different one.
 *
 * @returns A cookie adapter carrying this identity's verified session, ready to
 * pass as the `cookieAdapter` argument `checkUsageGate()`, `searchListings()`
 * and `scoreListings()` already expose.
 */
export async function mintRefreshSession(): Promise<
  Result<CookieMethodsServer>
> {
  const admin = createSecretClient();

  const created = await attempt(
    {
      kind: "database_unavailable",
      message:
        "Could not reach the auth server to create the refresh identity.",
      context: { email: DEMO_REFRESH_EMAIL },
    },
    async () =>
      await admin.auth.admin.createUser({
        email: DEMO_REFRESH_EMAIL,
        /**
         * An unconfirmed user cannot complete the magiclink exchange below, so
         * the mint would fail for a reason that looks nothing like its cause.
         * Nothing is ever emailed to this address, which cannot receive mail.
         */
        email_confirm: true,
      }),
  );

  if (isFailure(created)) return created;

  const createError = created.value.error;

  if (createError && !ALREADY_EXISTS_CODES.includes(createError.code ?? "")) {
    return failure({
      kind: "database_unavailable",
      severity: "unexpected",
      message: "Could not ensure the demo refresh identity exists.",
      context: { email: DEMO_REFRESH_EMAIL, code: createError.code },
      cause: createError,
    });
  }

  const linked = await attempt(
    {
      kind: "database_unavailable",
      message: "Could not reach the auth server to mint the refresh session.",
      context: { email: DEMO_REFRESH_EMAIL },
    },
    async () =>
      await admin.auth.admin.generateLink({
        type: "magiclink",
        email: DEMO_REFRESH_EMAIL,
      }),
  );

  if (isFailure(linked)) return linked;

  const { data: link, error: linkError } = linked.value;

  if (linkError || !link) {
    return failure({
      kind: "database_unavailable",
      severity: "unexpected",
      message: "Could not generate a sign in link for the refresh identity.",
      context: { email: DEMO_REFRESH_EMAIL, code: linkError?.code },
      cause: linkError,
    });
  }

  const jar = createCookieJar();
  const supabase = await createClient(jar);

  const verified = await attempt(
    {
      kind: "database_unavailable",
      message: "Could not reach the auth server to verify the refresh session.",
      context: { email: DEMO_REFRESH_EMAIL },
    },
    async () =>
      /**
       * `type: "email"` AND NOT `"magiclink"`. That package's own
       * documentation marks the `magiclink` and `signup` verification types
       * deprecated; `"email"` is the current type for a token hash that
       * arrived by email (verified against the installed 2.112.3, the same
       * check `mintSession()` records).
       */
      await supabase.auth.verifyOtp({
        token_hash: link.properties.hashed_token,
        type: "email",
      }),
  );

  if (isFailure(verified)) return verified;

  const { data: session, error: verifyError } = verified.value;

  if (verifyError || !session.user) {
    return failure({
      kind: "session_missing",
      severity: "unexpected",
      message: "Could not exchange the sign in link for a refresh session.",
      context: { email: DEMO_REFRESH_EMAIL, code: verifyError?.code },
      cause: verifyError,
    });
  }

  if (jar.names().length === 0) {
    return failure({
      kind: "session_missing",
      severity: "unexpected",
      message:
        "The refresh session was verified but no cookie reached the jar, so nothing was actually persisted.",
      context: { email: DEMO_REFRESH_EMAIL },
    });
  }

  return success(jar);
}
