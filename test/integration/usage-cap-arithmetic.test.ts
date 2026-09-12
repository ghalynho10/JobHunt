import { describe, expect, it } from "vitest";

import { RESULTS_PER_PAGE } from "@/features/search/adzuna";

import { devOnlyAdminClient } from "../helpers/admin";

/**
 * Spec 0020, AC-9: the arithmetic that makes showing `job_search` alone tell
 * the whole truth.
 *
 * WHAT THIS ACTUALLY GUARDS. The search page shows one number, the caller's
 * own `job_search` usage, and says nothing about `ai_scoring` or `ai_check`.
 * That is honest only while `job_search`'s own cap binds at or before either
 * AI tier's, and it does so only because of the values in `usage_cap` today:
 * one search fetches `RESULTS_PER_PAGE` listings, each listing spends at most
 * one call of each AI tier, and both tiers' caps are `job_search`'s multiplied
 * by that number. Nothing structural holds that in place. If an operator edits
 * a cap, or `RESULTS_PER_PAGE` changes, the page starts quietly showing a
 * number that is no longer the binding one, and this test is the signal to
 * revisit the scope decision rather than to adjust the assertion.
 *
 * IT READS THE REAL ROWS RATHER THAN THE MIGRATION'S LITERALS. `usage_cap` is
 * editable with no deploy (AC-5), which is the whole reason a unit test cannot
 * do this job: pinning the seed values would prove what the migration wrote
 * and say nothing about what the running system will actually enforce.
 *
 * IT IMPORTS `RESULTS_PER_PAGE` RATHER THAN WRITING `20`. A copied literal
 * agrees with itself forever, including on the day the real one changes, which
 * is the one day this test needs to fail.
 *
 * IT LIVES IN `test/integration/`, NOT `test/integration-serial/`, and that is
 * deliberate: `test/integration-serial/model-client-router-usage-cap.test.ts`
 * temporarily zeroes every `ai_scoring` cap row, and `groupOrder: 1` means
 * that project starts only once every file here has finished, so this read can
 * never land inside its zeroed window.
 *
 * `usage_cap` IS READ THROUGH THE DATA API AS `service_role`, which is the one
 * role spec 0011 gave `select` on it, for exactly this kind of inspection. The
 * direct database helper is deliberately not used: nothing here needs a
 * privilege wider than the one the table already grants.
 */

/** The three windows each call type must have a cap for. */
const WINDOWS = [
  { scope: "account", period: "week" },
  { scope: "global", period: "day" },
  { scope: "global", period: "month" },
] as const;

/** The two tiers whose caps must clear `job_search`'s multiplied ceiling. */
const AI_CALL_TYPES = ["ai_scoring", "ai_check"] as const;

interface CapRow {
  readonly call_type: string;
  readonly scope: string;
  readonly period: string;
  readonly cap_value: number;
}

async function readCaps(): Promise<readonly CapRow[]> {
  const { data, error } = await devOnlyAdminClient()
    .from("usage_cap")
    .select("call_type, scope, period, cap_value");

  if (error || !data) {
    throw new Error(
      `Could not read usage_cap: ${error?.message ?? "no rows returned"}.`,
    );
  }

  return data;
}

function capFor(
  rows: readonly CapRow[],
  callType: string,
  scope: string,
  period: string,
): number {
  const row = rows.find(
    (candidate) =>
      candidate.call_type === callType &&
      candidate.scope === scope &&
      candidate.period === period,
  );

  if (row === undefined) {
    throw new Error(
      `No usage_cap row for ${callType} / ${scope} / ${period}. check_usage_gate treats a call type missing any one of its three rows as unconfigured.`,
    );
  }

  return row.cap_value;
}

describe("job_search's cap binds at or before either AI tier's (AC-9)", () => {
  it.each(
    AI_CALL_TYPES.flatMap((callType) =>
      WINDOWS.map((window) => ({ callType, ...window })),
    ),
  )(
    "$callType's $scope $period cap clears job_search's own, times RESULTS_PER_PAGE",
    async ({ callType, scope, period }) => {
      const rows = await readCaps();

      const jobSearch = capFor(rows, "job_search", scope, period);
      const tier = capFor(rows, callType, scope, period);

      /**
       * ALL THREE WINDOWS, NOT ONLY THE ONE THE PAGE SHOWS. The page displays
       * the account week, but a person hitting an AI tier's GLOBAL day ceiling
       * first would still be stopped by something the page never mentioned, so
       * the claim "job_search binds first" has to hold for every window or it
       * does not hold at all.
       */
      expect(tier).toBeGreaterThanOrEqual(jobSearch * RESULTS_PER_PAGE);
    },
  );

  it("uses a RESULTS_PER_PAGE above zero, so the comparison means something", async () => {
    /**
     * THE GUARD ON THE GUARD. At `RESULTS_PER_PAGE = 0` every assertion above
     * reduces to "a cap is at least zero" and passes for any values at all,
     * including ones that break the scope decision outright. The check would
     * still be green and would be proving nothing.
     */
    expect(RESULTS_PER_PAGE).toBeGreaterThan(0);
  });
});
