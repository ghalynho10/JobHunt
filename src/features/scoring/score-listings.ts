import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { CookieMethodsServer } from "@supabase/ssr";

import type { Listing } from "@/features/search/adzuna";
import { isFailure } from "@/lib/result";

import { checkFitScore, type CheckOutcome } from "./check";
import type { ScoringProfile } from "./rubric";
import { scoreListing, type ScoreOutcome } from "./score";

/**
 * One listing's full outcome: what the scorer said, and what the check made
 * of it (spec 0019, `## Feature design`).
 *
 * THE TWO SKIP VARIANTS ARE STRINGS AND NOT `CheckOutcome`S, deliberately.
 * "Nothing was attempted" and "something was attempted and did not finish"
 * are different facts about a card, and AC-8 requires the reader to be able
 * to tell them apart: a check that broke says so, a check that never needed
 * to run says nothing at all. Encoding the difference in the TYPE means a
 * later change cannot quietly render them the same, which a shared shape plus
 * a convention would allow.
 *
 * `"skipped_no_score"` is AC-5: the score itself refused or failed, so there
 * is no claim to check. `"skipped_no_skills"` is AC-4: the score succeeded
 * and claimed nothing, so there is nothing to check and no call is spent.
 */
export interface ListingOutcome {
  readonly score: ScoreOutcome;
  readonly check: CheckOutcome | "skipped_no_score" | "skipped_no_skills";
}

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
): Promise<readonly ListingOutcome[]> {
  return Sentry.startSpan(
    {
      name: "scoring.score_listings",
      op: "function",
      attributes: { listings: listings.length },
    },
    async (span): Promise<readonly ListingOutcome[]> => {
      const outcomes = await Promise.all(
        listings.map(async (listing) =>
          scoreThenCheck(profile, listing, cookieAdapter),
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

      /**
       * AC-10's four counts, sitting UNDER `scored` rather than beside it.
       *
       * `scored` MUST EQUAL `checked + checkSkippedEmpty + checkUnverifiable`,
       * and a test asserts exactly that identity. It is what makes these four
       * readable at all: without it, a page of listings that claimed nothing
       * and a page whose checks all broke both show a low `checked`, and an
       * operator cannot tell the quiet day from the outage.
       *
       * WHAT THE IDENTITY DOES NOT DO, corrected 2026-09-10 after a Fable 5.1
       * review (`docs/observability/spans.md`'s `scoring.score_listings` row
       * carries the same correction). It does NOT catch a fifth outcome being
       * added here later and tallied nowhere. It could not: a test can only
       * construct variants that already exist. The COMPILER catches that case
       * instead, in the tally below, which narrows every variant of
       * `ListingOutcome["check"]` by name and exhausts the string ones against
       * `never`. Keep the two apart, because the wrong half was being relied
       * on here: the type check guards that the partition stays COMPLETE, and
       * the test proves the ARITHMETIC over the variants that exist today.
       *
       * A LISTING WHOSE SCORE NEVER SUCCEEDED IS IN NONE OF THE FOUR. It is
       * already counted by `refused` or `failed`, and AC-5 means no check was
       * ever attempted on it, so counting it again under a check attribute
       * would double count the same listing under two different questions.
       */
      let checked = 0;
      let checkSkippedEmpty = 0;
      let flagged = 0;
      let checkUnverifiable = 0;

      for (const { score, check } of outcomes) {
        if (isFailure(score)) failed += 1;
        else if (score.value.allowed) scored += 1;
        else refused += 1;

        /**
         * EXHAUSTIVE OVER `ListingOutcome["check"]` BY CONSTRUCTION, which is
         * what actually protects AC-10's partition (a Fable 5.1 review on
         * 2026-09-09 found the earlier shape could not).
         *
         * THE OLD SHAPE ENDED IN A BARE `else` THAT COUNTED `checked`. A new
         * `Result` shaped variant added to the type would have fallen into it
         * and been counted as a completed check: the arithmetic would still
         * balance, the partition test would still pass, and the meaning of
         * `checked` would have quietly changed with nothing able to see it.
         * The two string variants are now narrowed by name and exhausted
         * against `never`, so adding a third fails `tsc` here rather than
         * being absorbed. The `Result` side is split into its failure and its
         * two decision branches explicitly for the same reason.
         *
         * NO CAST ANYWHERE IN THIS BLOCK. A cast to `never` would compile
         * whatever the type said, which is a guard that guards nothing.
         */
        if (typeof check === "string") {
          if (check === "skipped_no_score") {
            /** AC-5: no check was attempted, so it is in none of the four. */
          } else if (check === "skipped_no_skills") {
            checkSkippedEmpty += 1;
          } else {
            const exhaustive: never = check;
            void exhaustive;
          }
        } else if (isFailure(check)) {
          checkUnverifiable += 1;
        } else {
          const decision = check.value;

          if (decision.allowed) {
            checked += 1;
            if (decision.value.ungroundedSkills.length > 0) flagged += 1;
          } else {
            checkUnverifiable += 1;
          }
        }
      }

      span.setAttributes({
        scored,
        refused,
        failed,
        checked,
        checkSkippedEmpty,
        flagged,
        checkUnverifiable,
      });

      return outcomes;
    },
  );
}

/**
 * One listing, scored and then checked (spec 0019, AC-4, AC-5).
 *
 * CHAINED, NOT CONCURRENT, AND IT HAS TO BE. The check's whole input is the
 * score's own `matchedSkills`, so it cannot start before that list exists.
 * The two calls run in series per listing while the listings themselves still
 * run concurrently with each other, so the batch costs the slowest single
 * chain rather than twenty of them end to end.
 *
 * THE TWO SKIPS ARE WHERE THE BUDGET IS ACTUALLY PROTECTED. A refused or
 * failed score has no claim to check (AC-5), and a score claiming no skills
 * has nothing to check (AC-4). Either one spending an `ai_check` call would
 * buy a verdict about an empty list, and AC-4's separate count exists so a
 * page of listings that claimed nothing can never read as a page of verified
 * ones.
 *
 * @param profile The caller's own profile, already bounded by `boundProfile()`.
 * @param listing One listing this render is showing.
 * @param cookieAdapter The same test seam both calls beneath this expose.
 */
async function scoreThenCheck(
  profile: ScoringProfile,
  listing: Listing,
  cookieAdapter?: CookieMethodsServer,
): Promise<ListingOutcome> {
  const score = await scoreListing(profile, listing, cookieAdapter);

  /** AC-5: a refusal or a failure never triggers a check call. */
  if (isFailure(score) || !score.value.allowed) {
    return { score, check: "skipped_no_score" };
  }

  const claimedSkills = score.value.value.matchedSkills;

  /** AC-4: nothing claimed, so nothing to check and no call spent. */
  if (claimedSkills.length === 0) {
    return { score, check: "skipped_no_skills" };
  }

  return {
    score,
    check: await checkFitScore(listing, claimedSkills, cookieAdapter),
  };
}
