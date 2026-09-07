import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { CookieMethodsServer } from "@supabase/ssr";

import type { Listing } from "@/features/search/adzuna";
import { isFailure } from "@/lib/result";

import type { ScoringProfile } from "./rubric";
import { scoreListing, type ScoreOutcome } from "./score";

/**
 * Score every listing in one render, all at once (spec 0015, AC-8, AC-14).
 *
 * BINDING RULE 4: the named span opens as the FIRST statement, before a single
 * `scoreListing()` call is dispatched. A total outage of the vendor, or of the
 * gate beneath it, still leaves a span behind carrying the listing count, so
 * the failure ratio this operation will one day be alerted on has a
 * denominator even on the day everything is broken.
 *
 * CONCURRENTLY, NOT IN SEQUENCE (AC-8). Twenty calls at `ai_scoring`'s 30
 * second per call timeout would be ten minutes in series. Fired together, the
 * batch costs the slowest single call, which is what makes the sort once
 * design in AC-9 survivable at all.
 *
 * `Promise.all` IS SAFE HERE AND `allSettled` WOULD BE THE WRONG SHAPE.
 * `scoreListing()` returns a `Result` rather than throwing, per this project's
 * errors are values rule, so there is no rejection for `allSettled` to catch
 * and using it would wrap every outcome in a second layer of "did it throw"
 * that is answered "no" every time. A genuine throw from in here is a
 * programmer bug and SHOULD reach the error boundary, which is exactly what
 * `Promise.all` does with it.
 *
 * FIRING TWENTY AT ONCE CANNOT OVERSHOOT `usage_cap` (spec 0015, key
 * invariants). `check_usage_gate` takes a row lock and increments inside one
 * transaction (spec 0011), so concurrent calls serialise at that point rather
 * than all reading the same pre-increment count. Verified by direct read of
 * that function during spec 0015's cross check on 2026-09-06.
 *
 * @param profile The caller's own profile, already bounded by `boundProfile()`.
 * @param listings Every listing this render is showing, in Adzuna's own order.
 * @param cookieAdapter The same test seam `scoreListing()` exposes.
 * @returns One outcome per listing, in the order the listings arrived.
 */
export async function scoreListings(
  profile: ScoringProfile,
  listings: readonly Listing[],
  cookieAdapter?: CookieMethodsServer,
): Promise<readonly ScoreOutcome[]> {
  return Sentry.startSpan(
    {
      name: "scoring.score_listings",
      op: "function",
      attributes: { listings: listings.length },
    },
    async (span): Promise<readonly ScoreOutcome[]> => {
      const outcomes = await Promise.all(
        listings.map(async (listing) =>
          scoreListing(profile, listing, cookieAdapter),
        ),
      );

      /**
       * AC-14: the three way tally, recorded once every outcome has resolved.
       *
       * THREE COUNTS RATHER THAN A PASS OR FAIL, because the three mean
       * completely different things operationally. Twenty refusals is the
       * budget doing its job; twenty failures is an incident; a mix of scored
       * and failed is the ordinary flaky afternoon. A single ratio would read
       * all three the same, and the whole point of spec 0012's refusal shape
       * is that it never has to.
       */
      let scored = 0;
      let refused = 0;
      let failed = 0;

      for (const outcome of outcomes) {
        if (isFailure(outcome)) failed += 1;
        else if (outcome.value.allowed) scored += 1;
        else refused += 1;
      }

      span.setAttributes({ scored, refused, failed });

      return outcomes;
    },
  );
}
