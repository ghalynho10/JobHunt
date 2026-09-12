import { Text } from "@/components/ui/text";
import { isFailure } from "@/lib/result";
import { getJobSearchUsageSummary } from "@/lib/usage-gating/queries";

import type { searchListings } from "./adzuna";
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
 * THE READ RUNS AFTER THIS RENDER'S OWN SEARCH, AND THE `searchResult` PROP IS
 * THE ONLY THING MAKING THAT TRUE (spec 0020, AC-11). The prop's value is
 * never read. Its job is to be an already awaited result, so React cannot
 * render this component until `SearchPage`'s own `await searchListings()` has
 * resolved, by which point the gate call inside it has committed and the
 * counter reflects this search.
 *
 * WHY IT IS A PROP RATHER THAN A LINE OF CODE IN THE RIGHT ORDER. Reading
 * usage after the search in `SearchPage` would be equally correct today and
 * would stay correct only until somebody folded the read into a `Promise.all`,
 * which this page already does for two other reads. There is no statement here
 * to reorder: the ordering is a data dependency, and undoing it means moving
 * this read up the tree on purpose. That distinction is the whole reason spec
 * 0020 chose this shape over the simpler looking one.
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
  searchResult,
}: {
  /**
   * This render's own search, already resolved, or `undefined` on a bare
   * visit. Never read. See the header: it exists to order the call below.
   */
  readonly searchResult: Awaited<ReturnType<typeof searchListings>> | undefined;
}) {
  /**
   * `void` RATHER THAN A RENAME OR A DISABLE COMMENT, decided in spec 0020
   * rather than here. The prop is deliberately unused, which trips
   * `@typescript-eslint/no-unused-vars`, and `pnpm lint` runs
   * `--max-warnings=0` so a warning fails the build. A `_searchResult` rename
   * does NOT help: the rule is configured with no `argsIgnorePattern`, so the
   * underscore means nothing to it (checked against the real config). An
   * `eslint-disable` would be the first in `src/`. This is a real reference,
   * so the rule is satisfied honestly.
   *
   * DO NOT DELETE THIS LINE. Removing it makes the prop unused, which makes
   * lint fail, which invites removing the prop, which silently restores the
   * bug the prop exists to prevent.
   */
  void searchResult;

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
