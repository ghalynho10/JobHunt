import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { Span } from "@sentry/nextjs";

import type { ListingOutcome } from "@/features/scoring/score-listings";
import { scoreListings } from "@/features/scoring/score-listings";
import type { Listing } from "@/features/search/adzuna";
import { searchListings } from "@/features/search/adzuna";
import {
  attempt,
  failure,
  isFailure,
  success,
  type Result,
} from "@/lib/result";
import { createSecretClient } from "@/lib/supabase/secret";
import type { Json } from "@/lib/supabase/database.types";
import type { UsageGateReason } from "@/lib/usage-gating/gate";

import { DEMO_PERSONAS } from "./personas";
import { mintRefreshSession } from "./refresh-session";

/**
 * The manually triggered `/demo` refresh (spec 0021, AC-2, AC-17, AC-18).
 *
 * THIS IS THE ONLY WRITER IN THIS FEATURE, and it is the only paid call path
 * the demo has. `/demo` itself still spends nothing on any render: one Postgres
 * select for the results and one for the refresh metadata. Every Adzuna call
 * and every model call happens here, behind the route's shared secret, on a
 * cadence no visitor controls.
 *
 * ALL OR NOTHING (AC-17). Every kept listing must come back with an allowed
 * score AND, where a score claimed a skill, a clean grounding check, under BOTH
 * personas, before a single row is written. Anything short of that returns
 * without calling the write function at all, and the previous refresh's data
 * keeps rendering untouched.
 *
 * WHY THE CHECK IS STRICTER HERE THAN ON `/search`. There the grounding check
 * is best effort, because a real reader is waiting and a card with an
 * unverified skill list plus `SCORING_COPY.couldNotCheck` is better than no
 * page. Here nobody is waiting and a fully checked previous run is already on
 * screen, so an unfinished check is treated exactly like an unfinished score.
 * Writing the row anyway would mean storing an empty `ungrounded_skills` that
 * reads as "checked, nothing flagged" when nothing was checked, which is the
 * precise misrepresentation that column exists to prevent.
 *
 * NOTHING IS SELECTED, REORDERED OR PADDED BY HOW A SCORE TURNED OUT. The kept
 * set is decided before the first scoring call, from Adzuna's own order, and
 * whatever comes back is published unedited. That rule is the entire reason
 * this version answers the objection the fabricated version could not, so it is
 * enforced by the shape of this function rather than left to discipline: the
 * scores are not even available at the point the set is chosen.
 */

/**
 * The fixed query every refresh runs (spec 0021, **Feature design**).
 *
 * BROAD ON PURPOSE, so one search returns a mix of backend, frontend and full
 * stack postings and the two personas plausibly land on different bands. It is
 * fixed rather than tuned, and it is never adjusted after seeing what came
 * back: choosing the query by its results is the same cherry picking this
 * rework exists to remove, one step earlier in the pipe.
 */
export const DEMO_SEARCH_TITLE = "software engineer";

/** Nationwide within the already configured `ADZUNA_COUNTRY`. */
export const DEMO_SEARCH_LOCATION: string | undefined = undefined;

/**
 * How many of Adzuna's own results a refresh keeps, at most.
 *
 * A CEILING AND NEVER A TARGET. If de-duplication or Adzuna's own response
 * leaves fewer, the refresh publishes however many remain rather than retrying,
 * widening the query or padding the set. Both personas score the same kept set,
 * so this is up to 16 `demo_result` rows and up to 16 scoring calls plus up to
 * 16 chained check calls per refresh.
 */
export const KEPT_LISTING_COUNT = 8;

/**
 * What one refresh did.
 *
 * A REFUSAL IS A SUCCESS CARRYING `completed: false`, NEVER A `Failure`, which
 * is spec 0001 binding rule 3's own carve out and spec 0011 AC-5's shape. The
 * usage gate refusing a call is the system working exactly as designed, and
 * `failure()` marks the active span failed whatever the severity, so routing a
 * refusal through it would put a correct refusal into `demo.refresh`'s failure
 * ratio. AC-17 asks for a refusal to be reported at a different severity from a
 * genuine failure; this shape gives it that and more, since the refusal is
 * reported at info level and leaves the span successful while a genuine failure
 * reports an error and fails it.
 */
export type DemoRefreshOutcome =
  | {
      readonly completed: true;
      readonly listingCount: number;
      readonly rowCount: number;
    }
  | { readonly completed: false; readonly reason: UsageGateReason };

/** One `demo_result` row, in the shape `replace_demo_results()` reads. */
interface DemoResultRow {
  readonly persona_slug: string;
  readonly source_job_id: string;
  readonly sort_order: number;
  readonly title: string;
  readonly company_name: string;
  readonly location: string | null;
  readonly salary_min: number | null;
  readonly salary_max: number | null;
  readonly salary_currency: string | null;
  readonly salary_is_predicted: boolean;
  readonly description_snippet: string | null;
  readonly band: string;
  readonly matched_skills: readonly string[];
  readonly not_mentioned_skills: readonly string[];
  readonly ungrounded_skills: readonly string[];
  readonly reasoning: string;
}

/**
 * Runs one whole refresh, or changes nothing (AC-17).
 *
 * @returns `completed: true` with what was written; `completed: false` with the
 * gate's own reason when the budget refused a call; a `Failure` when something
 * genuinely broke. All three leave the database untouched except the first.
 */
export async function refreshDemoResults(): Promise<
  Result<DemoRefreshOutcome>
> {
  /**
   * BINDING RULE 4: the named span opens as the FIRST statement, before the
   * session is minted and before anything can return early, so a refresh that
   * fails at its very first step still leaves a denominator behind. Registered
   * in `docs/observability/spans.md`.
   */
  return Sentry.startSpan(
    { name: "demo.refresh", op: "function" },
    async (span): Promise<Result<DemoRefreshOutcome>> => {
      const session = await mintRefreshSession();

      if (isFailure(session)) return session;

      const searched = await searchListings(
        {
          title: DEMO_SEARCH_TITLE,
          ...(DEMO_SEARCH_LOCATION === undefined
            ? {}
            : { location: DEMO_SEARCH_LOCATION }),
        },
        session.value,
      );

      if (isFailure(searched)) return searched;

      if (!searched.value.allowed) {
        return refused(span, searched.value.reason, "job_search");
      }

      const kept = keepListings(searched.value.value);

      /**
       * ZERO IS THE ONE SHORT RESULT SET THIS ABORTS ON, and it is not a
       * departure from "publish whatever comes back". Publishing an empty set
       * would delete real results and stamp a fresh `refreshed_at` over them,
       * leaving the page in a state the spec designs no copy for: not AC-15's
       * "no refresh has ever run", because one just did, and not AC-12's
       * failure, because nothing failed. Aborting leaves the page in a state
       * the spec does describe. Any count from one upward publishes as is.
       */
      if (kept.length === 0) {
        return failure({
          kind: "record_not_found",
          severity: "unexpected",
          message: "The demo refresh search returned no usable listings.",
          context: { title: DEMO_SEARCH_TITLE },
        });
      }

      span.setAttribute("listings", kept.length);

      const rows: DemoResultRow[] = [];

      for (const persona of DEMO_PERSONAS) {
        /**
         * ONE `scoreListings()` CALL PER PERSONA, over the SAME kept set, and
         * it is the identical function `/search` calls for a real user. The
         * demo is scored by the real pipeline or it is not evidence of
         * anything.
         */
        const outcomes = await scoreListings(
          persona.profile,
          kept,
          session.value,
        );

        for (const [index, listing] of kept.entries()) {
          const outcome = outcomes[index];

          /**
           * `noUncheckedIndexedAccess` makes this reachable to the compiler
           * even though `scoreListings()` returns one outcome per listing in
           * order. It is a broken contract rather than an expected state, so
           * it aborts loudly rather than skipping the listing quietly.
           */
          if (outcome === undefined) {
            return failure({
              kind: "response_malformed",
              severity: "unexpected",
              message: "A scored listing came back without an outcome.",
              context: { persona: persona.slug, index },
            });
          }

          const resolved = resolveOutcome(outcome);

          if (resolved.kind === "failed") {
            return failure({
              kind: "external_service_failed",
              severity: "unexpected",
              message:
                "A demo refresh score or grounding check did not come back clean, so nothing was written.",
              context: {
                persona: persona.slug,
                sourceJobId: listing.sourceJobId,
                step: resolved.step,
              },
            });
          }

          if (resolved.kind === "refused") {
            return refused(span, resolved.reason, resolved.step);
          }

          /**
           * THE FLAGGED NAMES LEAVE THE MATCHED LIST BEFORE STORAGE, and an
           * exact string comparison is correct rather than a shortcut:
           * `checkFitScore()` already put every name it returns through
           * `keepOwnNames()` against this very `matchedSkills` array, so a
           * flagged name is byte for byte one of these strings. Matching
           * loosely here would be a second, weaker rule over a settled one.
           */
          const flagged = new Set(resolved.ungroundedSkills);

          rows.push({
            persona_slug: persona.slug,
            source_job_id: listing.sourceJobId,
            sort_order: index + 1,
            title: listing.title,
            company_name: listing.companyName,
            location: listing.location ?? null,
            salary_min: listing.salaryMin ?? null,
            salary_max: listing.salaryMax ?? null,
            salary_currency: listing.salaryCurrency ?? null,
            salary_is_predicted: listing.salaryIsPredicted,
            description_snippet: listing.descriptionSnippet ?? null,
            band: resolved.score.band,
            matched_skills: resolved.score.matchedSkills.filter(
              (skill) => !flagged.has(skill),
            ),
            not_mentioned_skills: resolved.score.notMentionedSkills,
            ungrounded_skills: resolved.ungroundedSkills,
            reasoning: resolved.score.reasoning,
          });
        }
      }

      const written = await writeDemoResults(rows);

      if (isFailure(written)) return written;

      span.setAttributes({ rows: rows.length, outcome: "completed" });

      return success({
        completed: true,
        listingCount: kept.length,
        rowCount: rows.length,
      });
    },
  );
}

/**
 * Adzuna's own order, de-duplicated, cut to the ceiling (AC-17).
 *
 * FIRST OCCURRENCE WINS, AND THE ORDER IS NEVER TOUCHED. Adzuna can return the
 * same advert twice; keeping the first occurrence in place preserves the rank
 * `sort_order` records. Sorting or re-ranking here would be this feature
 * choosing which real listings a reader sees, which is exactly what it must not
 * do.
 */
function keepListings(listings: readonly Listing[]): readonly Listing[] {
  const seen = new Set<string>();
  const unique: Listing[] = [];

  for (const listing of listings) {
    if (seen.has(listing.sourceJobId)) continue;
    seen.add(listing.sourceJobId);
    unique.push(listing);
  }

  return unique.slice(0, KEPT_LISTING_COUNT);
}

/** Which call a refusal or failure came from, for the report and the span. */
type RefreshStep = "job_search" | "ai_scoring" | "ai_check";

/**
 * One listing's outcome, reduced to the three things this refresh can do.
 *
 * EXHAUSTIVE OVER `ListingOutcome` BY CONSTRUCTION. The two string check
 * variants are narrowed by name and exhausted against `never`, the same shape
 * `scoreListings()`'s own tally uses and for the same reason: a third variant
 * added later fails `tsc` here rather than falling into a default branch and
 * being silently treated as a clean check.
 */
type ResolvedOutcome =
  | {
      readonly kind: "clean";
      readonly score: {
        readonly band: string;
        readonly matchedSkills: readonly string[];
        readonly notMentionedSkills: readonly string[];
        readonly reasoning: string;
      };
      readonly ungroundedSkills: readonly string[];
    }
  | {
      readonly kind: "refused";
      readonly reason: UsageGateReason;
      readonly step: RefreshStep;
    }
  | { readonly kind: "failed"; readonly step: RefreshStep };

function resolveOutcome(outcome: ListingOutcome): ResolvedOutcome {
  if (isFailure(outcome.score)) return { kind: "failed", step: "ai_scoring" };

  if (!outcome.score.value.allowed) {
    return {
      kind: "refused",
      reason: outcome.score.value.reason,
      step: "ai_scoring",
    };
  }

  const score = outcome.score.value.value;
  const { check } = outcome;

  if (typeof check === "string") {
    if (check === "skipped_no_score") {
      /**
       * Unreachable: `scoreThenCheck()` only produces this when the score
       * failed or was refused, and both were returned above. It is handled
       * rather than assumed away, because "cannot happen" written as a comment
       * is not a guarantee, and treating an unchecked listing as clean is the
       * one mistake this whole abort rule exists to prevent.
       */
      return { kind: "failed", step: "ai_check" };
    }

    if (check === "skipped_no_skills") {
      /**
       * A CLEAN OUTCOME, AND THE ONE PLACE A LISTING IS STORED WITHOUT A CHECK
       * HAVING RUN. The score claimed no skills at all, so there was no claim
       * to verify and no call was spent (spec 0019, AC-4). An empty
       * `ungrounded_skills` here means exactly what it means everywhere else in
       * this table: nothing was flagged. There is no unverified claim being
       * passed off as verified, because there is no claim.
       */
      return { kind: "clean", score, ungroundedSkills: [] };
    }

    const exhaustive: never = check;
    void exhaustive;
    return { kind: "failed", step: "ai_check" };
  }

  if (isFailure(check)) return { kind: "failed", step: "ai_check" };

  if (!check.value.allowed) {
    return { kind: "refused", reason: check.value.reason, step: "ai_check" };
  }

  return {
    kind: "clean",
    score,
    ungroundedSkills: check.value.value.ungroundedSkills,
  };
}

/**
 * A gate refusal: nothing written, nothing failed, reported at info level.
 *
 * `Sentry.captureMessage` DIRECTLY RATHER THAN THROUGH `failure()`, and the
 * exception is deliberate and narrow. Binding rule 3 states that a gate refusal
 * is never a `Failure` at any severity, because `failure()` fails the active
 * span and a correct refusal must never enter a failure ratio. AC-17 still asks
 * for the refusal to be reported, at a severity distinct from a genuine
 * failure. Info level is exactly the level `failure()` itself uses for an
 * `expected` severity, so this reports the same way without the span side
 * effect the binding rule forbids. The same shape `ApplyControl` uses for the
 * one failure that structurally cannot go through `failure()`.
 */
function refused(
  span: Span,
  reason: UsageGateReason,
  step: RefreshStep,
): Result<DemoRefreshOutcome> {
  span.setAttributes({
    outcome: "refused",
    refusedReason: reason,
    refusedStep: step,
  });

  Sentry.captureMessage(
    `The demo refresh was refused by the usage gate at ${step}: ${reason}. Nothing was written.`,
    "info",
  );

  return success({ completed: false, reason });
}

/**
 * The one write, through the one `security invoker` function (AC-17).
 *
 * THE SECRET KEY CLIENT IS THIS FEATURE'S OWN PERMITTED CALLER (binding rule 1,
 * caller 3), used a second way rather than added as a fourth caller: the read
 * path queries the two tables with it, and this calls a function with it. Both
 * tables carry row level security forced with zero policies, so `service_role`'s
 * own BYPASSRLS is what reaches them, and the function runs as its invoker
 * precisely so no elevated function owner has to.
 */
async function writeDemoResults(
  rows: readonly DemoResultRow[],
): Promise<Result<undefined>> {
  const supabase = createSecretClient();

  const attempted = await attempt(
    {
      kind: "database_unavailable",
      message: "Could not reach the database to write the demo results.",
      context: { rows: rows.length },
    },
    async () =>
      await supabase.rpc("replace_demo_results", {
        /**
         * The rows go over as JSON and are unpacked by `jsonb_to_recordset` on
         * the other side, so the delete, the insert and the metadata update all
         * sit inside one function call and therefore one transaction. Sending
         * them as separate statements would give a failure halfway through the
         * chance to leave the page holding half a refresh.
         */
        p_results: rows as unknown as Json,
        p_search_title: DEMO_SEARCH_TITLE,
        ...(DEMO_SEARCH_LOCATION === undefined
          ? {}
          : { p_search_location: DEMO_SEARCH_LOCATION }),
      }),
  );

  if (isFailure(attempted)) return attempted;

  const { error } = attempted.value;

  /**
   * BINDING RULE 5: `attempt()` converts a thrown exception and only that. The
   * Supabase client returns `{ error }` for a refused statement, a failed check
   * constraint or a missing grant, so the returned error is checked separately.
   */
  if (error) {
    return failure({
      kind: "database_unavailable",
      severity: "unexpected",
      message: "The database refused the demo results write.",
      context: { rows: rows.length, code: error.code, hint: error.hint },
      cause: error,
    });
  }

  return success(undefined);
}
