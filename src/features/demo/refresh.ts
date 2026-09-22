import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { Span } from "@sentry/nextjs";

import type { ListingOutcome } from "@/features/scoring/score-listings";
import { scoreListings } from "@/features/scoring/score-listings";
import type { Listing } from "@/features/search/adzuna";
import { searchListings } from "@/features/search/adzuna";
import { listingDedupKey } from "@/lib/listing-dedup";
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

import { DEMO_PERSONAS, type DemoPersonaSlug } from "./personas";
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

/** One fixed query, and the candidate whose own role it names. */
interface DemoSearch {
  readonly title: string;
  readonly persona: DemoPersonaSlug;
}

/**
 * The two fixed queries every refresh runs, in the order they run (spec 0021,
 * **Feature design**, "The fixed search queries", revised 2026-09-15).
 *
 * TWO OPPOSED ROLES, NOT ONE BROAD QUERY. The first real refresh searched
 * "software engineer": 15 of its 16 rows carried zero matched skills, and three
 * of its eight listings were roles neither candidate fits. Each query here is
 * one candidate's own first desired title, so each candidate gets its own
 * likely strong matches and its own likely mismatches, and AC-16's cross
 * candidate line can show a difference in both directions. A single role query
 * would lean toward whichever candidate it named.
 *
 * FIXED, AND NEVER RE-TUNED AFTER SEEING A RUN. Choosing a query by its results
 * is the same cherry picking this rework removed, one step earlier in the pipe.
 * The spec names one condition under which these are looked at again, its
 * stopping rule, and that rule's answer is to leave them alone. `skillCounts`
 * below is what it reads.
 *
 * `persona` IS WHICH CANDIDATE THE QUERY IS THE OWN ROLE FOR, which is what
 * separates an own role row from a cross role one in `skillCounts`. The titles
 * must stay in step with `demo_result.search_title`'s check constraint
 * (`supabase/migrations/20260913120000_demo_result.sql`).
 */
export const DEMO_SEARCHES = [
  { title: "backend engineer", persona: "backend-engineer" },
  { title: "frontend engineer", persona: "frontend-engineer" },
] as const satisfies readonly [DemoSearch, DemoSearch];

/** One of the two fixed query titles. */
export type DemoSearchTitle = (typeof DEMO_SEARCHES)[number]["title"];

/** Nationwide within the already configured `ADZUNA_COUNTRY`, for both queries. */
export const DEMO_SEARCH_LOCATION: string | undefined = undefined;

/**
 * How many of ONE search's results a refresh keeps, at most.
 *
 * PER SEARCH, AND A CEILING RATHER THAN A TARGET. Two searches make this up to
 * 8 listings in total, so still up to 16 `demo_result` rows, 16 scoring calls
 * and 16 chained check calls, exactly what one search of 8 cost. A search that
 * returns fewer publishes what it has: it is never topped up from the other
 * search, retried, or widened.
 */
export const KEPT_LISTING_COUNT = 4;

/**
 * The own role and cross role skill counts for the spec's stopping rule.
 *
 * TWO PAIRS, AND ONLY THE OWN ROLE PAIR ANSWERS THE RULE. An own role row is a
 * candidate scored against a listing its own query kept; a cross role row is
 * that candidate scored against the other role's listing, where zero matched
 * skills is often the correct result. Counting empties across all rows would
 * mix the two and fire on almost any run, so both pairs are recorded and kept
 * apart. Computed from the rows about to be written, never from a later read.
 */
export interface DemoSkillCounts {
  readonly ownRoleRows: number;
  /** Own role rows whose stored `matched_skills` is empty. */
  readonly ownRoleEmpty: number;
  readonly crossRoleRows: number;
  /** Cross role rows whose stored `matched_skills` is empty. */
  readonly crossRoleEmpty: number;
}

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
      readonly skillCounts: DemoSkillCounts;
    }
  | { readonly completed: false; readonly reason: UsageGateReason };

/** One `demo_result` row, in the shape `replace_demo_results()` reads. */
interface DemoResultRow {
  readonly persona_slug: DemoPersonaSlug;
  readonly source_job_id: string;
  readonly sort_order: number;
  readonly search_title: DemoSearchTitle;
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

      const [backendSearch, frontendSearch] = DEMO_SEARCHES;

      const backend = await runSearch(backendSearch, session.value);

      if (isFailure(backend)) return backend;

      if (!backend.value.allowed) {
        return refused(
          span,
          backend.value.reason,
          "job_search",
          backendSearch.title,
        );
      }

      /**
       * THE SECOND SEARCH RUNS ONLY ONCE THE FIRST HAS COMPLETED, and a refused
       * or failed second search aborts even though the first succeeded. Only a
       * search that succeeds and returns nothing is the "publish the other
       * search's listings" case the walk handles; a search that did not
       * complete is never read as an empty one.
       */
      const frontend = await runSearch(frontendSearch, session.value);

      if (isFailure(frontend)) return frontend;

      if (!frontend.value.allowed) {
        return refused(
          span,
          frontend.value.reason,
          "job_search",
          frontendSearch.title,
        );
      }

      const kept = keepListings(backend.value.value, frontend.value.value);

      /**
       * ZERO IS THE ONE SHORT RESULT SET THIS ABORTS ON, and it is not a
       * departure from "publish whatever comes back". Publishing an empty set
       * would delete real results and stamp a fresh `refreshed_at` over them,
       * leaving the page in a state the spec designs no copy for: not AC-15's
       * "no refresh has ever run", because one just did, and not AC-12's
       * failure, because nothing failed. Aborting leaves the page in a state
       * the spec does describe. Any count from one upward publishes as is,
       * including one search keeping none while the other keeps some.
       */
      if (kept.length === 0) {
        return failure({
          kind: "record_not_found",
          severity: "unexpected",
          message: "The demo refresh searches returned no usable listings.",
          context: { titles: DEMO_SEARCHES.map((search) => search.title) },
        });
      }

      span.setAttribute("listings", kept.length);

      const listings = kept.map((entry) => entry.listing);
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
          listings,
          session.value,
        );

        for (const [index, entry] of kept.entries()) {
          const outcome = outcomes[index];
          const { listing } = entry;

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
            return refused(span, resolved.reason, resolved.step, undefined);
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
            sort_order: entry.sortOrder,
            search_title: entry.searchTitle,
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

      const skillCounts = countSkills(rows);

      const written = await writeDemoResults(rows);

      if (isFailure(written)) return written;

      span.setAttributes({
        rows: rows.length,
        outcome: "completed",
        ...skillCounts,
      });

      return success({
        completed: true,
        listingCount: kept.length,
        rowCount: rows.length,
        skillCounts,
      });
    },
  );
}

/**
 * One fixed search, with its title on the Sentry scope while it runs.
 *
 * THE TITLE GOES ON THE SCOPE, NOT INTO A COPY OF THE FAILURE. `searchListings()`
 * builds its own `Failure` through `failure()`, which reports the moment it is
 * built, so by the time one reaches this function its report has already been
 * sent. Rebuilding it here with a `title` added would either report the same
 * fault twice or mean writing a failure object by hand, which binding rule 2
 * forbids. Setting the context on the current scope first means that one report
 * already says which of the two searches broke. It is cleared afterwards, so a
 * later scoring failure is not reported as though it belonged to a search.
 */
async function runSearch(
  search: DemoSearch,
  cookieAdapter: Parameters<typeof searchListings>[1],
): ReturnType<typeof searchListings> {
  const scope = Sentry.getCurrentScope();

  scope.setContext("demo_search", { title: search.title });

  const searched = await searchListings(
    {
      title: search.title,
      ...(DEMO_SEARCH_LOCATION === undefined
        ? {}
        : { location: DEMO_SEARCH_LOCATION }),
    },
    cookieAdapter,
  );

  scope.setContext("demo_search", null);

  return searched;
}

/** One listing the walk kept, with where it came from and where it sits. */
export interface KeptListing {
  readonly listing: Listing;
  /** The search whose turn kept it, stored as `demo_result.search_title`. */
  readonly searchTitle: DemoSearchTitle;
  /** The walk's keep order, 1 based, stored as `demo_result.sort_order`. */
  readonly sortOrder: number;
}

/**
 * Both searches' own Adzuna order, walked in alternating turns (AC-7, AC-17).
 *
 * THE RULE, AS THE SPEC STATES IT. Backend takes the first turn, then frontend,
 * and so on. On its turn a search keeps its next listing, in its own order,
 * whose dedup key neither search has kept yet, skipping any that has been,
 * so a duplicate costs that search nothing. A search stops taking turns once it
 * has kept `KEPT_LISTING_COUNT` or its own results run out, and the other
 * carries on alone. A short search is never topped up from the other.
 *
 * A LISTING BOTH SEARCHES RETURNED IS KEPT ONCE, by whichever search reaches it
 * first, which at equal rank is the backend search because it moves first. That
 * tie rule is fixed before any score exists, so it cannot be a selection by
 * outcome.
 *
 * PURE AND EXPORTED, so it is tested directly over plain listing arrays with
 * nothing mocked, and the zero case (two empty lists give an empty result) is
 * provable without a session or a search.
 */
export function keepListings(
  backend: readonly Listing[],
  frontend: readonly Listing[],
): readonly KeptListing[] {
  const [backendSearch, frontendSearch] = DEMO_SEARCHES;

  /**
   * EACH LANE'S ITERATOR IS THE ONE PIECE OF STATE THE WALK NEEDS, and it is
   * local to this call. An iterator remembers how far through its own results a
   * search has read, which is exactly "its next listing" in the rule above.
   */
  const lanes = [
    { title: backendSearch.title, remaining: backend.values() },
    { title: frontendSearch.title, remaining: frontend.values() },
  ] as const;

  /**
   * KEYED ON `listingDedupKey()`, NOT ON `sourceJobId` (spec 0022, AC-8).
   * `/search` collapses the same job under two ids with that key, so `/demo`
   * uses the same one or a pair would be one result there and two here
   * (invariant 5). The key is stable per listing, so one listing returned by
   * both searches is still recognised as the same one.
   */
  const seen = new Set<string>();
  const kept: KeptListing[] = [];
  const finished = new Set<DemoSearchTitle>();

  while (finished.size < lanes.length) {
    for (const lane of lanes) {
      if (finished.has(lane.title)) continue;

      const next = nextUnseen(lane.remaining, seen);

      if (next === undefined) {
        finished.add(lane.title);
        continue;
      }

      seen.add(listingDedupKey(next));
      kept.push({
        listing: next,
        searchTitle: lane.title,
        sortOrder: kept.length + 1,
      });

      const keptByLane = kept.filter(
        (entry) => entry.searchTitle === lane.title,
      ).length;

      if (keptByLane >= KEPT_LISTING_COUNT) finished.add(lane.title);
    }
  }

  return kept;
}

/** The next listing an iterator yields whose dedup key has not been kept yet. */
function nextUnseen(
  remaining: Iterator<Listing>,
  seen: ReadonlySet<string>,
): Listing | undefined {
  while (true) {
    const step = remaining.next();

    if (step.done === true) return undefined;
    if (!seen.has(listingDedupKey(step.value))) return step.value;
  }
}

/**
 * The stopping rule's counts, from the rows about to be written.
 *
 * AN OWN ROLE ROW IS ONE WHERE THE ROW'S PERSONA IS THE PERSONA ITS SEARCH WAS
 * FOR: the backend candidate on a listing the "backend engineer" search kept,
 * the frontend candidate on one "frontend engineer" kept. Every other row is
 * cross role. Empty means the stored `matched_skills`, after the grounding
 * check removed anything it flagged, because that is what the card shows.
 */
function countSkills(rows: readonly DemoResultRow[]): DemoSkillCounts {
  const isOwnRole = (row: DemoResultRow): boolean =>
    DEMO_SEARCHES.some(
      (search) =>
        search.title === row.search_title &&
        search.persona === row.persona_slug,
    );

  const own = rows.filter(isOwnRole);
  const cross = rows.filter((row) => !isOwnRole(row));
  const empty = (subset: readonly DemoResultRow[]): number =>
    subset.filter((row) => row.matched_skills.length === 0).length;

  return {
    ownRoleRows: own.length,
    ownRoleEmpty: empty(own),
    crossRoleRows: cross.length,
    crossRoleEmpty: empty(cross),
  };
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
 *
 * @param search The refused search's title when the step is `job_search`, so
 * the report says which of the two searches the budget declined; `undefined`
 * for a scoring or check refusal, which belongs to no one search.
 */
function refused(
  span: Span,
  reason: UsageGateReason,
  step: RefreshStep,
  search: DemoSearchTitle | undefined,
): Result<DemoRefreshOutcome> {
  span.setAttributes({
    outcome: "refused",
    refusedReason: reason,
    refusedStep: step,
    ...(search === undefined ? {} : { refusedSearch: search }),
  });

  Sentry.captureMessage(
    search === undefined
      ? `The demo refresh was refused by the usage gate at ${step}: ${reason}. Nothing was written.`
      : `The demo refresh was refused by the usage gate at ${step} for "${search}": ${reason}. Nothing was written.`,
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
        /**
         * BOTH TITLES, IN THE ORDER THE SEARCHES RAN, which is the order the
         * page names them in. The table's own check requires exactly two.
         */
        p_search_titles: DEMO_SEARCHES.map((search) => search.title),
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
