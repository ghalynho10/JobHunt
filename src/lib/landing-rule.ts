import "server-only";

import * as Sentry from "@sentry/nextjs";

import { hasProfileRow } from "@/features/profile/queries";
import { isFailure } from "@/lib/result";

/**
 * Where a signed in visitor lands (spec 0008, AC-6, AC-7, AC-7a, AC-5b).
 *
 * EXACTLY ONE FUNCTION DECIDES THIS, and every caller imports it from here. The
 * door at `/go`, the `/sign-in` bounce and the OAuth callback all need the same
 * answer, and three copies of a rule this small is how they quietly stop
 * agreeing. Feature 14's scoring gate layers onto the CALLERS of this rule
 * later; it does not widen the rule, because a rule that grew a second question
 * would become the onboarding flow `docs/app-shell-direction.md` ruled out.
 *
 * IT READS PROFILE ROW EXISTENCE ONLY, NEVER PROFILE SUFFICIENCY. Whether a
 * profile is good enough to score against is a different question with a
 * different owner.
 *
 * IT NEVER REDIRECTS (AC-24a). It returns a path and the caller redirects,
 * because `redirect()` works by throwing and a throw inside the span below would
 * record this operation as having failed when it succeeded.
 *
 * It lives in `src/lib` rather than in a feature because its three callers span
 * two features plus a bare route handler, and neither `/go` nor `src/proxy.ts`
 * may import from a feature.
 */

/** A visitor with a profile lands on search, which is what the product is for. */
export const LANDING_PATH_WITH_PROFILE = "/search";

/**
 * A visitor with no profile row lands on their profile, so the first thing they
 * see asks for what the product needs from them.
 */
export const LANDING_PATH_WITHOUT_PROFILE = "/profile";

/**
 * The path this signed in visitor should land on.
 *
 * @param userId The caller's own id, taken from claims the caller has ALREADY
 * verified. Passing it in is AC-15a: the callback hands over what
 * `completeSignIn()` resolved rather than making this build a second Supabase
 * client to read the session again, so the session is read once per request and
 * the question of whether a later client observes cookies written earlier in the
 * same request never has to be answered.
 * @returns `/profile` when no profile row exists, `/search` otherwise.
 */
export async function landingPathFor(userId: string): Promise<string> {
  /**
   * BINDING RULE 4: the named span opens as the FIRST statement, before any
   * guard clause or early return. Registered in `docs/observability/spans.md`.
   */
  return Sentry.startSpan(
    { name: "landing_rule.decide", op: "function" },
    async (): Promise<string> => {
      const existence = await hasProfileRow(userId);

      if (isFailure(existence)) {
        /**
         * AC-7a. AN ERRORED READ IS NOT AN EMPTY PROFILE. The failure has
         * already reported and marked this span failed, so nothing is silent.
         * What is left is a destination, and `/search` is the one that assumes
         * nothing about this person's data. Sending them to `/profile` during a
         * database outage would tell them their profile is empty, which is a
         * default that reads like an answer.
         */
        return LANDING_PATH_WITH_PROFILE;
      }

      return existence.value
        ? LANDING_PATH_WITH_PROFILE
        : LANDING_PATH_WITHOUT_PROFILE;
    },
  );
}
