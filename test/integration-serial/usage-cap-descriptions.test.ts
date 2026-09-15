import { describe, expect, it } from "vitest";

import {
  NON_PERSONAL_TABLES,
  STORED_FIELDS,
} from "@/features/legal/stored-fields";

import { devOnlyAdminClient } from "../helpers/admin";

/**
 * Spec 0020, AC-10: the two descriptions of the usage gating tables must keep
 * telling the truth about what those tables count.
 *
 * THE FAILURE THIS EXISTS FOR ALREADY HAPPENED ONCE. Both descriptions were
 * written when `job_search` was the only gated call type, and said so. Then
 * migration `20260906120000_model_client_router_usage_cap.sql` added
 * `ai_scoring` and `ai_check` rows to the same two tables and neither
 * description was updated, so the privacy notice quietly described a narrower
 * system than the one running. Nothing caught it for five days; it was found by
 * reading, not by a test.
 *
 * IT CHECKS THE CLAIM, NOT THE PROSE, and the difference is the whole design.
 * Asserting the two sentences verbatim would fail on any reword, which turns a
 * correctness guard into churn and trains people to update the expected string
 * without thinking. What must stay true is narrower: each description names
 * every KIND of call these tables now count. A better sentence that still tells
 * the truth passes; a revert to "job search today" fails.
 *
 * IT READS THE REAL `usage_cap` ROWS RATHER THAN A LIST WRITTEN HERE, which is
 * what makes it a guard rather than a second copy of the same assumption. The
 * call types are no deploy editable data, so the only honest source for "what
 * do these tables count" is the table itself. A unit test could not do this; it
 * would have to hardcode the three call types and would then agree with itself
 * forever, including on the day a fourth arrives, which is exactly the day this
 * check needs to fire.
 *
 * `usage_cap` IS READ AS `service_role`, the one role spec 0011 granted
 * `select` on it for this kind of inspection.
 *
 * WHY IT LIVES IN `test/integration-serial/`, NOT `test/integration/`. It
 * reads EVERY row of `usage_cap`, which is global state, and demands that
 * every call type it finds is one this file knows. `test/integration/**` files
 * run in parallel by default, and `test/integration/usage-gating.test.ts`
 * legitimately inserts its own `gate_test` call type into that same table for
 * about two seconds across four of its tests, then deletes it. A read landing
 * in that window saw `gate_test` and failed with this file's own "a new gated
 * call type" message, for a call type that was never real. It failed 3 runs in
 * 10 on one branch and 0 in 10 on another with these test files byte for byte
 * identical, because whether the two overlap depends only on how workers
 * happen to be scheduled, and it was pinned down on 2026-09-15 by starting
 * this file one second after that one, which failed 3 times out of 3. Placed
 * here, `groupOrder: 1` plus this project's `fileParallelism: false`
 * (`vitest.config.mts`) mean the read happens only once every `integration`
 * file, and its cleanup, has finished. Same reasoning, and the same table, as
 * the moves made for `usage-summary.test.ts` and
 * `model-client-router-usage-cap.test.ts`.
 */

/**
 * The idea each call type obliges the descriptions to mention.
 *
 * A CALL TYPE MISSING FROM THIS MAP FAILS THE TEST ON PURPOSE. That is the
 * structural half: a future migration adding a fourth kind of gated call
 * cannot pass silently, because the author has to come here, decide what the
 * privacy notice now owes the reader, and say so. Without that, this test
 * would only ever guard the three call types someone thought about today.
 */
const CONCEPT_BY_CALL_TYPE: Readonly<Record<string, RegExp>> = {
  job_search: /job search/i,
  ai_scoring: /\bAI\b/,
  ai_check: /\bAI\b/,
};

/** The `usage_cap` description shown as a non personal table. */
function usageCapDescription(): string {
  const entry = NON_PERSONAL_TABLES.find((row) => row.table === "usage_cap");

  if (entry === undefined) {
    throw new Error(
      "usage_cap is no longer listed in NON_PERSONAL_TABLES; spec 0020 AC-10 describes it there.",
    );
  }

  return entry.why;
}

/** The `usage_gate_counter.call_type` description, the one `/privacy` renders. */
function callTypeDescription(): string {
  const field = STORED_FIELDS.find(
    (row) => row.table === "usage_gate_counter" && row.column === "call_type",
  );

  if (field === undefined) {
    throw new Error(
      "usage_gate_counter.call_type is no longer in STORED_FIELDS; spec 0020 AC-10 describes it there.",
    );
  }

  return field.describedAs;
}

async function gatedCallTypes(): Promise<readonly string[]> {
  const { data, error } = await devOnlyAdminClient()
    .from("usage_cap")
    .select("call_type");

  if (error || !data) {
    throw new Error(
      `Could not read usage_cap: ${error?.message ?? "no rows returned"}.`,
    );
  }

  return [...new Set(data.map((row) => row.call_type))].sort();
}

describe("the usage gating descriptions stay true as usage_cap grows (AC-10)", () => {
  it("counts more than one kind of call, so 'job search only' is provably false", async () => {
    /**
     * THE PREMISE THE OTHER TESTS REST ON. If `usage_cap` ever held only
     * `job_search` again, a description naming just that would be correct and
     * the assertions below would be wrong to demand more. Stated as its own
     * test so that situation reads as a changed world rather than a mystery
     * failure in the two checks underneath it.
     */
    const callTypes = await gatedCallTypes();

    expect(callTypes.length).toBeGreaterThan(1);
    expect(callTypes).toContain("job_search");
  });

  it("classifies every call type present, so a new one cannot slip in unreviewed", async () => {
    const callTypes = await gatedCallTypes();
    const unclassified = callTypes.filter(
      (callType) => CONCEPT_BY_CALL_TYPE[callType] === undefined,
    );

    expect(
      unclassified,
      `usage_cap now holds ${unclassified.join(", ")}, which this test does not know about. A new gated call type means the privacy notice may have gone stale the way it did in September 2026. Decide what the two descriptions in src/features/legal/stored-fields.ts owe the reader, then add the call type to CONCEPT_BY_CALL_TYPE.`,
    ).toEqual([]);
  });

  it.each([
    ["usage_cap, in NON_PERSONAL_TABLES", usageCapDescription],
    ["usage_gate_counter.call_type, in STORED_FIELDS", callTypeDescription],
  ])("%s names every kind of call these tables count", async (_label, read) => {
    /**
     * BOTH DESCRIPTIONS, and only one of them is user facing. The `call_type`
     * one renders on `/privacy`; `usage_cap`'s `why` reaches no page at all and
     * is read only by the legal suite. AC-10 requires both anyway, because the
     * registry is what the next person reading this codebase believes, and a
     * false sentence there outlives whoever wrote it.
     */
    const description = read();
    const callTypes = await gatedCallTypes();

    for (const callType of callTypes) {
      const concept = CONCEPT_BY_CALL_TYPE[callType];
      if (concept === undefined) continue;

      expect(
        concept.test(description),
        `usage_cap holds "${callType}" but this description never mentions it: "${description}"`,
      ).toBe(true);
    }
  });
});
