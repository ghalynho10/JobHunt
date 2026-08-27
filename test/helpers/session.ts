import { createClient } from "@/lib/supabase/server";

import { devOnlyAdminClient } from "./admin";
import { createCookieJar, type CookieJar } from "./cookie-jar";

/**
 * The development only session mint (spec 0004, AC-1 and AC-3).
 *
 * Signs in as a fixture user without driving a browser, so a test can prove
 * real isolation against the real policies with a real session.
 *
 * HOW, AND WHY THIS SHAPE. The secret client generates an admin magiclink for
 * the user, which yields a hashed token, and that token is exchanged through
 * the APPLICATION'S OWN request scoped client into an in memory cookie jar. The
 * exchange has to go through `src/lib/supabase/server.ts` rather than a client
 * built here, or the test would prove a parallel implementation works and say
 * nothing about the one that ships.
 *
 * It does NOT depend on the development password sign in from feature 1, which
 * feature 7 deletes. Nothing here needs a password.
 */

export interface MintedSession {
  /**
   * The jar now holding the session cookies. Pass it to `createClient()` to get
   * a client that reads as this user, exactly as a request would.
   */
  readonly jar: CookieJar;
  readonly userId: string;
  readonly email: string;
}

/**
 * Mints a real signed in session for an existing user.
 *
 * Verified on 2026-08-26 against the installed `@supabase/auth-js` 2.112.3
 * rather than from memory, per spec 0004's first follow-up and the supabase
 * skill's core principle that this API changes often:
 *
 * - `admin.generateLink({ type: "magiclink", email })` resolves to
 *   `{ data: { properties: { hashed_token, … }, user }, error }`.
 * - `verifyOtp({ token_hash, type })` accepts the `VerifyTokenHashParams` shape.
 *   `type` is `"email"`, NOT `"magiclink"`: that package's own documentation
 *   marks the `magiclink` and `signup` verification types deprecated, and
 *   `"email"` is the current type for a token hash that arrived by email.
 *
 * Throws rather than returning a failure value: every path out of here is a
 * broken test setup, which is a programmer bug and should keep its stack.
 */
export async function mintSession(email: string): Promise<MintedSession> {
  const admin = devOnlyAdminClient();

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (linkError || !link) {
    throw new Error(
      `Could not generate a magic link for ${email}: ${linkError?.message ?? "no data returned"}. The user has to exist already; use mintFixtureUser() for a fresh one.`,
    );
  }

  const jar = createCookieJar();
  const supabase = await createClient(jar);

  const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email",
  });

  if (verifyError || !verified.user) {
    throw new Error(
      `Could not exchange the magic link for ${email}: ${verifyError?.message ?? "no user returned"}.`,
    );
  }

  /**
   * The exchange is only real if the session actually landed in the jar. A
   * client keeps the session in memory too, so without this check a jar that
   * silently received nothing would still read correctly through THIS client
   * and fail only when a second one was built from it, which is what every
   * caller does next.
   */
  if (jar.names().length === 0) {
    throw new Error(
      `The session for ${email} was verified but no cookie reached the jar, so nothing was actually persisted.`,
    );
  }

  return { jar, userId: verified.user.id, email };
}
