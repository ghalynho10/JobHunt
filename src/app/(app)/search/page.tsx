import Link from "next/link";
import { Suspense } from "react";

import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import { AppHeader } from "@/features/app-shell/app-header";
import { readAppliedJobIds } from "@/features/applications/queries";
import { SCORING_COPY } from "@/features/scoring/copy";
import { readScoringProfile } from "@/features/scoring/profile-gate";
import { BANDS, bandRank } from "@/features/scoring/rubric";
import type { ScoringProfile } from "@/features/scoring/rubric";
import type { ScoreOutcome } from "@/features/scoring/score";
import { ScoreCard } from "@/features/scoring/score-card";
import { scoreListings } from "@/features/scoring/score-listings";
import type { Listing } from "@/features/search/adzuna";
import { searchListings } from "@/features/search/adzuna";
import { SEARCH_COPY } from "@/features/search/copy";
import { FocusRecorder, FocusRestorer } from "@/features/search/focus-keeper";
import { readSearchPrefill } from "@/features/search/preferences";
import { ResultList } from "@/features/search/result-list";
import { SearchForm } from "@/features/search/search-form";
import { isFailure } from "@/lib/result";
import { SENTENCES } from "@/lib/usage-gating/copy";

/**
 * Search (spec 0013).
 *
 * A SERVER COMPONENT READING THE SEARCH TERMS FROM THE URL, never a Server
 * Action and never a client side fetch (spec 0013, Decision). The whole
 * operation, gate check, Adzuna call and parse, runs server side in
 * `searchListings()`, and a shared `/search?q=...` link is a real, working
 * search.
 *
 * THE SEARCH ITSELF STILL SHIPS NO CLIENT JAVASCRIPT; THE PAGE NO LONGER CAN
 * SAY THAT. This comment used to end "so no client JavaScript ships for search
 * at all", and feature 12 (spec 0014) made that half false: each result card
 * now renders `ApplyControl`, one small Client Component, because the apply
 * must NOT re-render this page. A re-render re-runs `searchListings()` and
 * spends one of the 25 weekly Adzuna calls, and a form with no JavaScript needs
 * a rendered response, which IS that re-render. So the choice was client
 * JavaScript or a per apply cost, and the cost lost. The boundary is drawn as
 * small as it goes: this page, the form, the twenty cards, both attributions
 * and every salary line all stay server rendered.
 *
 * A BARE VISIT RUNS NO SEARCH AND SPENDS NO BUDGET (AC-9). The URL carrying
 * `q` or `where` is the whole signal: absent, the page prefills from the
 * caller's own `job_preference` row and stops there.
 *
 * A RELOAD, A BACK NAVIGATION AND A SHARED LINK EACH SPEND ONE GATE CHECK AND
 * ONE ADZUNA CALL (AC-10, Consequences). Each is a distinct render carrying
 * the same params, and there is no client side cache to serve a repeat view
 * from, so the weekly cap is a cap on renders rather than on distinct intents
 * to search. That cost is recorded rather than engineered around.
 */
export default async function SearchPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  /**
   * A repeated parameter (`?q=a&q=b`) arrives as an array. The first value is
   * taken rather than the pair joined, so a crafted URL cannot smuggle a
   * second term into one field.
   */
  const single = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const q = single(params["q"]);
  const where = single(params["where"]);
  const hasQuery = q !== undefined || where !== undefined;

  return (
    <>
      <AppHeader current="search" />

      <main className="flex-1">
        <Section weight="standard">
          <Heading level={1}>Search</Heading>

          {hasQuery ? (
            <SearchResults title={q} location={where} />
          ) : (
            <PrefilledForm />
          )}
        </Section>
      </main>
    </>
  );
}

/**
 * A bare visit: the form, prefilled from the caller's stated preferences.
 *
 * IT NEVER CALLS `searchListings()` (AC-9). A prefill failure falls back to
 * empty fields rather than blocking the form: the reader can still type a
 * search, and the failure is already reported by `failure()` itself.
 *
 * THE FAILURE IS ALSO SAID OUT LOUD, and that half was missing until a fresh
 * model review found it on 2026-09-04. Reporting to Sentry is not the same as
 * telling the reader: empty fields are AC-9's meaning of "no stated
 * preference", so a failed read was quietly claiming the reader had none.
 * `COPY-6` separates the two. It carries `role="alert"` like the page's other
 * two failure states, since this is a real failure rather than the ordinary
 * empty outcome, and it sits above the form rather than in place of it.
 */
async function PrefilledForm() {
  const prefill = await readSearchPrefill();

  if (isFailure(prefill)) {
    return (
      <>
        <div role="alert" className="mb-6">
          <Text className="text-secondary">{SEARCH_COPY.prefillFailed}</Text>
        </div>
        <SearchForm />
      </>
    );
  }

  return (
    <SearchForm title={prefill.value.title} location={prefill.value.location} />
  );
}

/**
 * A search: the form carrying what was asked for, and exactly one of the four
 * outcomes below.
 *
 * THE THREE VISIBLE STATES ARE DISTINCT ON PURPOSE (AC-3, AC-4, AC-5). A gate
 * refusal, an empty result and a failure are three different things that have
 * happened, and a reader deciding what to do next needs to tell them apart.
 */
async function SearchResults({
  title,
  location,
}: {
  readonly title: string | undefined;
  readonly location: string | undefined;
}) {
  const result = await searchListings({ title, location });

  /**
   * AC-2: both fields blank is refused before the gate is checked and before
   * any Adzuna call runs, and it is the one failure shown on the form itself
   * rather than in place of the results.
   */
  if (isFailure(result) && result.kind === "validation_failed") {
    return (
      <SearchForm
        title={title}
        location={location}
        error={SEARCH_COPY.bothFieldsBlank}
      />
    );
  }

  return (
    <>
      <SearchForm title={title} location={location} />

      <div className="mt-10">
        <SearchOutcome result={result} />
      </div>
    </>
  );
}

async function SearchOutcome({
  result,
}: {
  readonly result: Awaited<ReturnType<typeof searchListings>>;
}) {
  /**
   * AC-5: the failure state. One sentence for every way the search itself
   * broke, because the difference between a timeout and a malformed body is
   * not something a reader can act on. The specific kind is already in
   * Sentry, reported by `failure()` at the point it happened.
   */
  if (isFailure(result)) {
    return (
      <div role="alert">
        <Text className="text-secondary">{SEARCH_COPY.searchFailed}</Text>
      </div>
    );
  }

  /**
   * AC-3: the refusal state, rendering feature 10's own sentence verbatim.
   * This feature writes no copy for the five reasons; `SENTENCES` is keyed by
   * the reason `checkUsageGate()` returned.
   */
  if (!result.value.allowed) {
    return (
      <div role="alert">
        <Text className="text-secondary">{SENTENCES[result.value.reason]}</Text>
      </div>
    );
  }

  const listings = result.value.value;

  /**
   * AC-4: the empty state. NO `role="alert"`, deliberately: a search that
   * legitimately matched nothing is an ordinary outcome, not a failure, which
   * is the same convention the placeholder page this replaced already set.
   */
  if (listings.length === 0) {
    return <Text className="text-muted">{SEARCH_COPY.noResults}</Text>;
  }

  /**
   * ONE `now` FOR THE WHOLE LIST, so twenty cards cannot disagree about what
   * "today" is mid render.
   */
  const now = new Date();

  /**
   * AC-9 (spec 0014): which of these the reader has already applied to, asked
   * once for the whole page and scoped to the ids actually on screen.
   *
   * THIS SPENDS NO ADZUNA CALL. It is a plain read of the caller's own
   * `application` rows, so marking the list costs a database query and nothing
   * from the weekly budget.
   *
   * BOTH READS RUN CONCURRENTLY (spec 0015). Neither depends on the other and
   * both sit between the reader and their results, so running them in series
   * would make the page wait two round trips to show one screen.
   */
  const [applied, scoring] = await Promise.all([
    readAppliedJobIds(listings.map((listing) => listing.sourceJobId)),
    readScoringProfile(),
  ]);

  const appliedIds = isFailure(applied) ? undefined : applied.value;

  return (
    <>
      {/*
       * `AGENTS.md`: no silent failures, and this one is easy to get wrong.
       * Rendering every card unmarked when the read failed would silently tell
       * the reader they have applied to none of these, which is a claim the app
       * cannot make. `COPY-8` says what actually happened instead. This is the
       * same shape as the failed prefill read above, which a fresh model review
       * caught on 2026-09-04 for exactly this reason.
       */}
      {isFailure(applied) ? (
        <div role="alert" className="mb-6">
          <Text className="text-secondary">
            {SEARCH_COPY.appliedReadFailed}
          </Text>
        </div>
      ) : undefined}

      {/*
       * Spec 0015, the profile read failure. Same shape and same reasoning as
       * the two failed reads above it: an unscored list with nothing said would
       * quietly claim this search does not score.
       */}
      {scoring.kind === "unavailable" ? (
        <div role="alert" className="mb-6">
          <Text className="text-secondary">
            {SCORING_COPY.profileReadFailed}
          </Text>
        </div>
      ) : undefined}

      {/*
       * AC-7: the thin profile gate. NO `role="alert"`, because nothing failed.
       * A profile with no skills and no work history is an ordinary starting
       * state, and this is the same convention the empty results state above
       * already sets.
       */}
      {scoring.kind === "thin" ? (
        <div className="mb-6">
          <Text className="text-secondary">
            {SCORING_COPY.thinProfile.split(SCORING_COPY.thinProfileLink)[0]}
            <Link href="/profile" className="underline underline-offset-2">
              {SCORING_COPY.thinProfileLink}
            </Link>
            {SCORING_COPY.thinProfile.split(SCORING_COPY.thinProfileLink)[1]}
          </Text>
        </div>
      ) : undefined}

      {scoring.kind === "score" ? (
        <>
          {/*
           * Spec 0015, AC-17. IT SITS OUTSIDE THE BOUNDARY BELOW, DELIBERATELY.
           * The reveal unmounts everything inside the boundary, and this is the
           * one thing that has to survive it: it is listening for which card
           * control the reader was on at the moment the swap happens. Inside,
           * it would be torn down exactly when its answer is needed.
           *
           * It is rendered ONLY on the scored path, because it is only that
           * path that reveals anything. An unscored list never re-sorts, so
           * nothing there can orphan a reader's focus.
           */}
          <FocusRecorder />

          {/*
           * AC-9: THE LIST RENDERS IMMEDIATELY AND THE PAGE IS NEVER BLOCKED ON
           * SCORING. The fallback is the whole result list in Adzuna's own order,
           * every card complete and clickable, each carrying its pending
           * indicator. Twenty concurrent model calls at a 30 second per call
           * timeout sit inside this boundary; nothing above or below it waits.
           *
           * This is the Strategic Suspense Boundaries pattern named in spec
           * 0015's Decision: the boundary is drawn around exactly the slow
           * thing and no more.
           */}
          <Suspense
            fallback={
              <ResultList
                rows={listings.map((listing) => ({
                  listing,
                  score: <ScoreCard outcome="pending" />,
                  busy: true,
                }))}
                now={now}
                appliedIds={appliedIds}
              />
            }
          >
            <ScoredResults
              profile={scoring.profile}
              listings={listings}
              now={now}
              appliedIds={appliedIds}
            />
          </Suspense>
        </>
      ) : (
        <ResultList
          rows={listings.map((listing) => ({ listing }))}
          now={now}
          appliedIds={appliedIds}
        />
      )}
    </>
  );
}

/**
 * The resolved half of the Suspense boundary: every outcome in, ranked once,
 * rendered (spec 0015, AC-8, AC-9, AC-10, AC-11).
 *
 * IT SORTS EXACTLY ONCE, AFTER EVERY OUTCOME HAS RESOLVED, and that is a
 * deliberate trade recorded in spec 0015's Consequences rather than a
 * simplification. Revealing each card as its own call lands would reorder the
 * list under the reader's cursor up to twenty times. The cost is that the one
 * visible reorder waits for the slowest of the twenty calls, and in a vendor
 * outage that is the full 30 second timeout with twenty failure states at the
 * end of it. The list itself is on screen and usable throughout.
 */
async function ScoredResults({
  profile,
  listings,
  now,
  appliedIds,
}: {
  readonly profile: ScoringProfile;
  readonly listings: readonly Listing[];
  readonly now: Date;
  readonly appliedIds: ReadonlySet<string> | undefined;
}) {
  const outcomes = await scoreListings(profile, listings);

  /**
   * AC-9: outcomes are paired to their listing HERE, in Adzuna's original
   * order, before anything reorders. Everything downstream carries the pair, so
   * the sort moves a listing and its own outcome together and no later step
   * can match them up by an array position that has since changed.
   *
   * A MISSING OUTCOME THROWS RATHER THAN RENDERS. `scoreListings()` returns one
   * outcome per listing by construction, so a hole here is a programmer bug,
   * and a bug should reach the error boundary (`AGENTS.md`). Rendering the card
   * as unscored instead would hide a broken pairing behind a screen that looks
   * exactly like a working one.
   */
  const paired = listings.map((listing, index) => {
    const outcome = outcomes[index];

    if (outcome === undefined) {
      throw new Error(
        `scoreListings() returned ${outcomes.length} outcomes for ${listings.length} listings.`,
      );
    }

    return { listing, outcome };
  });

  /**
   * AC-11: the cap notice, taken from the FIRST refused call in the listing's
   * original order, read off `paired` before the sort touches it.
   *
   * WHY THE FIRST AND NOT A LIST OF THEM. Twenty concurrent calls can straddle
   * a cap boundary and come back with more than one distinct reason, and a
   * notice that enumerated them would describe the machinery rather than tell
   * the reader what to do. One sentence, from feature 10's own `SENTENCES`
   * table, is what this feature renders; it writes no copy of its own for any
   * of the five reasons.
   */
  const refusal = paired.find(
    (row) => !isFailure(row.outcome) && !row.outcome.value.allowed,
  )?.outcome;

  const refusedReason =
    refusal === undefined || isFailure(refusal) || refusal.value.allowed
      ? undefined
      : refusal.value.reason;

  /**
   * AC-9's ranking. Scored cards first, by band, `strong_match` at the top;
   * then every refused or failed card after all of them.
   *
   * `[...paired].sort()` COPIES FIRST, so `paired` above stays in Adzuna's
   * order for the refusal lookup, which AC-11 defines against that order.
   *
   * THE TIE BREAK IS THE SORT'S OWN STABILITY, not a second comparison on
   * `sourceJobId` or on anything else. `Array.prototype.sort` has been required
   * to be stable since ES2019, so two cards in the same band come out in the
   * relative order they went in, which is Adzuna's. Adding a tie break here
   * would replace Adzuna's own relevance ordering with an arbitrary one.
   */
  const ranked = [...paired].sort(
    (left, right) => outcomeRank(left.outcome) - outcomeRank(right.outcome),
  );

  /**
   * Whether anything was actually ranked, which is what `COPY-7` claims.
   *
   * THE SORT ALWAYS RUNS; A RANKING DOES NOT ALWAYS RESULT. When every outcome
   * is a refusal or a failure they all tie at the same rank, so the sort is a
   * no operation and the list stays in Adzuna's own order. Announcing a ranking
   * there states something untrue, which is why this is a condition rather than
   * the unconditional render it used to be (found by `/check verify` on
   * 2026-09-06, reproduced in both the all refused and all failed cases).
   *
   * "AT LEAST ONE SCORED" IS THE RIGHT TEST, not "no refusals" and not "no
   * failures". A partly scored batch is genuinely ranked by fit, so the
   * sentence is true there and still renders.
   */
  const anythingScored = paired.some(
    (row) => !isFailure(row.outcome) && row.outcome.value.allowed,
  );

  return (
    <>
      {/*
       * Spec 0015, AC-17: the reveal has happened, so focus goes back to the
       * control the reader was on. IT SITS INSIDE THE RESOLVED CONTENT ON
       * PURPOSE, because mounting IS the reveal signal: there is no event a
       * component outside the boundary could listen for that says the swap is
       * done and the ranked DOM is in place.
       *
       * It renders nothing, and it moves focus only when the reveal actually
       * orphaned somebody. Every rule that decides that lives in
       * `focus-keeper.tsx`, not here.
       */}
      <FocusRestorer />

      {refusedReason === undefined ? undefined : (
        <div role="alert" className="mb-6">
          <Text className="text-secondary">{SENTENCES[refusedReason]}</Text>
        </div>
      )}

      {/*
       * AC-16, `COPY-7`. `role="status"` rather than a bare `aria-live`
       * container: this node arrives with the streamed content and does not
       * exist during the fallback, and a role carries the live semantics with
       * it rather than depending on the region having been present beforehand.
       *
       * IT IS VISIBLE RATHER THAN SCREEN READER ONLY, on purpose. The list just
       * reordered itself under everyone, not only under a screen reader, and a
       * sighted reader who was halfway down it deserves the same one line of
       * explanation.
       *
       * IT IS CONDITIONAL, and that is the whole point of `anythingScored`
       * above: a batch where nothing scored has nothing to announce, and saying
       * it anyway tells a reader who cannot see the list that it is ranked when
       * it is not.
       */}
      {anythingScored ? (
        <div role="status" className="mb-6">
          <Text variant="monoLabel">{SCORING_COPY.reranked}</Text>
        </div>
      ) : undefined}

      <ResultList
        rows={ranked.map(({ listing, outcome }) => ({
          listing,
          score: <ScoreCard outcome={outcome} />,
        }))}
        now={now}
        appliedIds={appliedIds}
      />
    </>
  );
}

/**
 * Where one outcome sorts (AC-9). Lower is higher on the page.
 *
 * REFUSED AND FAILED SHARE THE LAST RANK, so both land after every scored card
 * while keeping their own relative order between them through the sort's
 * stability. They are told apart by what renders on the card, not by where the
 * card sits: a failure shows `COPY-3` and a refusal shows nothing at all, with
 * the cap named once above the list.
 */
function outcomeRank(outcome: ScoreOutcome): number {
  if (isFailure(outcome) || !outcome.value.allowed) return BANDS.length;

  return bandRank(outcome.value.value.band);
}
