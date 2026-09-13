import { Text } from "@/components/ui/text";
import { isFailure } from "@/lib/result";
import { getJobSearchUsageSummary } from "@/lib/usage-gating/queries";

import { SEARCH_COPY } from "./copy";

/**
 * The caller's own search allowance, shown on every `/search` render (spec
 * 0020, AC-1).
 *
 * IT RENDERS ABOVE THE `hasQuery` CONDITIONAL, WHICH IS THE WHOLE POINT. A
 * bare visit and a visit with results both show it, so the number is already
 * on the page before anybody searches. Putting it beside the results would
 * make it appear only after the search that spent one, which is exactly the
 * surprise this feature exists to remove.
 *
 * IT COSTS NO ADZUNA CALL AND WRITES NOTHING. `getJobSearchUsageSummary()`
 * reads through a strictly read only Postgres function, so rendering this on a
 * bare visit neither spends budget nor creates a counter row (AC-3). It is a
 * plain `await` with no `Suspense` boundary of its own: the read is one
 * indexed lookup, and it is unrelated to the slow scoring path already
 * Suspended further down the page.
 *
 * THE READ RUNS AFTER THIS RENDER'S OWN SEARCH, AND THIS COMPONENT IS WHAT
 * MAKES THAT TRUE (spec 0020, AC-11). It awaits the `searchInFlight` promise
 * before calling `getJobSearchUsageSummary()`, so by the time the read goes
 * out, the search has resolved and its gate call has committed. Nothing is
 * read out of the promise; it is waited on, not consumed.
 *
 * WHAT GUARDS THIS, STATED HONESTLY, BECAUSE TWO STRONGER CLAIMS HAVE ALREADY
 * BEEN WRONG HERE. This is an ordinary `await` and an edit can undo it. There
 * are two guards and they cover different mistakes:
 *
 *   - DELETING the `await` leaves `searchInFlight` unused, and `pnpm lint`
 *     runs at `--max-warnings=0`, so the build fails at edit time.
 *   - REORDERING it is caught only by the three ordering tests in
 *     `src/app/(app)/search/page.test.ts`.
 *
 * THE FORBIDDEN EDIT IS `Promise.all`. Folding the two waits together,
 * `await Promise.all([searchInFlight, getJobSearchUsageSummary()])`, looks
 * like a free round trip saved. It uses the prop, it typechecks, it lints
 * clean, and it puts the read back alongside the search, which is the exact
 * bug this component was reshaped to fix. Only the tests will stop you.
 *
 * An earlier version of this file passed the RESOLVED search result as a prop
 * that was never read, with a `void searchResult;` line to satisfy lint, and
 * claimed the prop held the ordering. It did not: `SearchPage`'s own `await`
 * did, and removing the prop changed nothing. That claim survived a review, a
 * verify pass and a full suite before a second model caught it, which is why
 * this comment now says what is true rather than what is reassuring.
 *
 * ONE SOURCE ON EVERY PATH (AC-12). The number always comes from
 * `getJobSearchUsageSummary()`, on a bare visit, an allowed search, all five
 * refusal reasons, and every failure. There is deliberately no second source
 * and so no rule choosing between them. An earlier design had the gate return
 * the count it produced; it was dropped because two of the five refusals and
 * every failure path never produce one, so it would have needed this read as a
 * fallback anyway (spec 0020, Decision).
 *
 * THE FAILURE IS SAID OUT LOUD AND BLOCKS NOTHING (AC-6). Rendering nothing
 * here, or a zero, would hand a database outage the meaning of "you have used
 * none of your allowance", which is the default that reads like success the
 * project's own rule forbids. `COPY-2` takes the same shape as this page's
 * other two failed reads: `role="alert"`, above the content rather than in
 * place of it, and the search form still renders underneath.
 *
 * THE SUCCESS LINE CARRIES NO `role`, deliberately, and it is not a live
 * region either. Nothing failed and nothing changed under the reader; it is
 * ordinary page content that happens to hold two numbers, and announcing it
 * on every render would interrupt somebody for a status they did not ask for.
 * That is the same convention the empty results state and the thin profile
 * notice already set.
 */
export async function UsageNotice({
  searchInFlight,
}: {
  /**
   * This render's own search, still in flight, or `undefined` on a bare visit.
   *
   * `Promise<unknown>`, NOT the search's own return type, on purpose: this
   * component waits on the search and must never grow a dependency on what a
   * search returns. The wide type is what keeps that honest.
   */
  readonly searchInFlight: Promise<unknown> | undefined;
}) {
  /**
   * THE ORDERING, IN ONE PLACE, because a stack trace lands a reader on this
   * line rather than at the top of the file, and this is the line that has
   * been got wrong twice. This `await` is the whole mechanism: it holds the
   * usage read below until this render's own search has resolved and its gate
   * call has committed, so the figure shown counts THIS search and not the one
   * before it (spec 0020, AC-11). Deleting it leaves `searchInFlight` unused
   * and fails `pnpm lint` at `--max-warnings=0`. Folding it into
   * `await Promise.all([searchInFlight, getJobSearchUsageSummary()])` lints and
   * typechecks clean and is caught only by the ordering tests in
   * `src/app/(app)/search/page.test.ts`. The file header above says why at
   * length. On a bare visit there is nothing to wait for and the read runs
   * immediately.
   */
  if (searchInFlight !== undefined) await searchInFlight;

  const summary = await getJobSearchUsageSummary();

  if (isFailure(summary)) {
    return (
      <div role="alert" className="mt-4">
        <Text className="text-secondary">{SEARCH_COPY.usageUnavailable}</Text>
      </div>
    );
  }

  return (
    <div className="mt-4">
      {/*
       * `monoLabel`: a short literal the product measured, which is what this
       * is (`src/components/ui/text.tsx`). The same variant the reranked
       * status line and every salary on this page already use.
       */}
      <Text variant="monoLabel">
        {SEARCH_COPY.usageThisWeek(
          summary.value.consumedCount,
          summary.value.capValue,
        )}
      </Text>
    </div>
  );
}
