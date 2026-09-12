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
export async function UsageNotice() {
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
