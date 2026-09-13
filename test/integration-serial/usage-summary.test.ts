import { afterAll, describe, expect, it } from "vitest";

import { checkUsageGate } from "@/lib/usage-gating/gate";
import { getJobSearchUsageSummary } from "@/lib/usage-gating/queries";
import { isFailure } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

import { createCookieJar } from "../helpers/cookie-jar";
import { queryAsSuperuser } from "../helpers/database";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession } from "../helpers/session";

/**
 * Spec 0020: the read only usage summary, against the real local stack.
 *
 * WHY THIS NEEDS THE STACK. Every criterion here is a property of the Postgres
 * function itself: that it reads `consumed_count` and not `attempt_count`,
 * that it creates no row, that its `period_start` agrees with the one the gate
 * actually writes, and that `usage_gate_counter` is still unreachable from the
 * Data API. A unit test with a mocked RPC could only encode the same
 * assumptions the function exists to enforce, which is exactly the mock this
 * project's test rule forbids.
 *
 * WHY IT LIVES IN `test/integration-serial/`, NOT `test/integration/`. Two
 * things here touch state shared across the whole suite rather than scoped to
 * one minted account: the scenarios below drive REAL `job_search` gate calls,
 * which increment the app wide global day and month counters, and one of them
 * temporarily edits the real `job_search` account week row in `usage_cap`.
 * `test/integration/**` files run in parallel by default, and
 * `test/integration/usage-gating.test.ts` resets those same global rows and
 * then asserts they hold exactly `{ attempt_count: 1, consumed_count: 1 }`
 * after one call, which is only true while nothing else is calling
 * `job_search` beside it. Placed in `integration`, this file broke that one
 * intermittently: it failed on the first full run and passed on the second,
 * which is the shape of failure that gets rerun rather than diagnosed.
 * `groupOrder: 1` plus this project's `fileParallelism: false`
 * (`vitest.config.mts`) means these scenarios start only once every
 * `integration` file has finished, and run alone while they do. Same
 * reasoning, and the same two tables, as the move `/check review` made for
 * `model-client-router-usage-cap.test.ts` on 2026-09-06.
 *
 * THE RPC IS ALWAYS DRIVEN THROUGH A REAL MINTED SESSION, matching spec 0011's
 * own convention. `queryAsSuperuser` appears below only to SET UP a counter row
 * or to OBSERVE one afterwards, never as the identity making the call: the
 * whole point of several of these is that the caller reaches the data through
 * `auth.uid()` and a `security definer` function, and a superuser making the
 * call would prove none of it.
 */

const JOB_SEARCH = "job_search";
const mintedUserIds: string[] = [];

async function freshSession(prefix: string) {
  const user = await mintFixtureUser(prefix);
  mintedUserIds.push(user.id);
  return mintSession(user.email);
}

/**
 * Resets `job_search`'s real, shared global windows, for the same reason
 * `test/integration/usage-gating.test.ts` does it: the scenarios below that
 * drive real gate calls consume a little of the real global day and month
 * budget on every run, and enough repeated runs against a long lived local
 * stack would push the global day cap to its ceiling, so a test meaning to
 * prove an account window property would start failing for a global one. A
 * missing window row is exactly what a fresh window looks like.
 */
async function resetJobSearchGlobalWindows() {
  await queryAsSuperuser(
    `delete from public.usage_gate_counter
      where call_type = $1 and scope = 'global'`,
    [JOB_SEARCH],
  );
}

/** The account week row the gate writes, read directly to observe it. */
async function accountWeekRow(profileId: string) {
  const rows = await queryAsSuperuser<{
    attempt_count: number;
    consumed_count: number;
    period_start: string;
  }>(
    /**
     * `period_start::text`, NOT the bare column. The `pg` driver hands a
     * `date` back as a JavaScript `Date` while PostgREST hands the same value
     * back as a `YYYY-MM-DD` string, so comparing the two raw would fail on a
     * type difference rather than on the disagreement AC-4 is about. Casting
     * in SQL puts both sides in the same shape.
     */
    `select attempt_count, consumed_count, period_start::text as period_start
       from public.usage_gate_counter
      where call_type = $1 and scope = 'account' and profile_id = $2
        and period = 'week'
      order by period_start desc limit 1`,
    [JOB_SEARCH, profileId],
  );

  return rows[0];
}

afterAll(async () => {
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

describe("the caller's own usage, read live (AC-1, AC-5)", () => {
  it("reports exactly what the gate consumed, against the seeded cap", async () => {
    await resetJobSearchGlobalWindows();
    const session = await freshSession("usage-summary-happy");

    /**
     * TWO REAL GATE CALLS, not a seeded row, because AC-1 is about the number
     * shown agreeing with the number enforced. Seeding here would prove the
     * function can read a row somebody put there, which is a weaker claim than
     * the one this criterion makes.
     */
    for (let index = 0; index < 2; index += 1) {
      const decision = await checkUsageGate(JOB_SEARCH, session.jar);
      if (isFailure(decision)) {
        throw new Error(
          `The gate failed rather than deciding: ${decision.kind}.`,
        );
      }
      expect(decision.value.allowed).toBe(true);
    }

    const summary = await getJobSearchUsageSummary(session.jar);

    if (isFailure(summary)) {
      throw new Error(`Expected a summary, got a failure: ${summary.kind}.`);
    }

    expect(summary.value.consumedCount).toBe(2);

    /**
     * AC-5: THE CAP IS COMPARED AGAINST THE TABLE, NOT AGAINST `25`. A literal
     * here would pass today and would keep passing after an operator's no
     * deploy cap change had stopped the page telling the truth, which is the
     * one failure this criterion is about.
     */
    const [cap] = await queryAsSuperuser<{ cap_value: number }>(
      `select cap_value from public.usage_cap
        where call_type = $1 and scope = 'account' and period = 'week'`,
      [JOB_SEARCH],
    );

    expect(summary.value.capValue).toBe(cap?.cap_value);
  });

  it("follows a cap change with no deploy (AC-5)", async () => {
    const session = await freshSession("usage-summary-cap-change");

    const [original] = await queryAsSuperuser<{ cap_value: number }>(
      `select cap_value from public.usage_cap
        where call_type = $1 and scope = 'account' and period = 'week'`,
      [JOB_SEARCH],
    );

    if (original === undefined) {
      throw new Error("No job_search account week cap row found in usage_cap.");
    }

    /**
     * THE NUMBER IS MADE TO MOVE ON PURPOSE. A reader that could not see
     * `usage_cap` at all would return the same value before and after, and so
     * would a correct one if the cap never changed, so the two cases are
     * indistinguishable without actually changing it.
     */
    const changed = original.cap_value + 7;

    await queryAsSuperuser(
      `update public.usage_cap set cap_value = $1
        where call_type = $2 and scope = 'account' and period = 'week'`,
      [changed, JOB_SEARCH],
    );

    try {
      const summary = await getJobSearchUsageSummary(session.jar);

      if (isFailure(summary)) {
        throw new Error(`Expected a summary, got a failure: ${summary.kind}.`);
      }

      expect(summary.value.capValue).toBe(changed);
    } finally {
      await queryAsSuperuser(
        `update public.usage_cap set cap_value = $1
          where call_type = $2 and scope = 'account' and period = 'week'`,
        [original.cap_value, JOB_SEARCH],
      );
    }
  });
});

describe("it reads consumed_count and never attempt_count (AC-2)", () => {
  it("reports the consumed number when the two have diverged", async () => {
    const session = await freshSession("usage-summary-consumed");

    /**
     * THE ROW IS SEEDED RATHER THAN EARNED, and this is the one scenario where
     * that is the stronger choice. The two counters only diverge once a call
     * has been REFUSED, and driving the account window to a refusal means
     * spending its whole weekly cap through the real gate, which would also
     * spend that much of the shared global day budget on every run. Seeding
     * sets the exact divergence the criterion is about, and the read itself
     * still goes through the real RPC as the real caller.
     *
     * THE TWO NUMBERS ARE DELIBERATELY FAR APART. Adjacent values would let an
     * off by one in either direction still look like the other.
     */
    const [row] = await queryAsSuperuser<{ period_start: string }>(
      `insert into public.usage_gate_counter
         (call_type, scope, profile_id, period, period_start,
          attempt_count, consumed_count)
       values ($1, 'account', $2, 'week',
               pg_catalog.date_trunc('week', pg_catalog.now() at time zone 'utc')::date,
               19, 4)
       returning period_start`,
      [JOB_SEARCH, session.userId],
    );

    expect(row).toBeDefined();

    const summary = await getJobSearchUsageSummary(session.jar);

    if (isFailure(summary)) {
      throw new Error(`Expected a summary, got a failure: ${summary.kind}.`);
    }

    expect(summary.value.consumedCount).toBe(4);
    expect(summary.value.consumedCount).not.toBe(19);
  });
});

describe("the read is strictly read only (AC-3)", () => {
  it("reports zero for a caller with no row, and creates none", async () => {
    const session = await freshSession("usage-summary-readonly");

    const before = await accountWeekRow(session.userId);
    expect(before).toBeUndefined();

    const summary = await getJobSearchUsageSummary(session.jar);

    if (isFailure(summary)) {
      throw new Error(`Expected a summary, got a failure: ${summary.kind}.`);
    }

    expect(summary.value.consumedCount).toBe(0);

    /**
     * THE HALF THAT MATTERS. `check_usage_gate` upserts a window row into
     * existence as part of deciding; if this function ever grew the same
     * behaviour, a bare `/search` visit would start writing counter rows for
     * people who never searched, and the number itself would still read
     * correctly. Only this check would notice.
     */
    const after = await accountWeekRow(session.userId);
    expect(after).toBeUndefined();
  });
});

describe("its week window agrees with the one the gate enforces (AC-4)", () => {
  it("returns the same period_start the gate actually wrote", async () => {
    await resetJobSearchGlobalWindows();
    const session = await freshSession("usage-summary-window");

    const decision = await checkUsageGate(JOB_SEARCH, session.jar);
    if (isFailure(decision)) {
      throw new Error(
        `The gate failed rather than deciding: ${decision.kind}.`,
      );
    }

    const written = await accountWeekRow(session.userId);
    const summary = await getJobSearchUsageSummary(session.jar);

    if (isFailure(summary)) {
      throw new Error(`Expected a summary, got a failure: ${summary.kind}.`);
    }

    /**
     * THE OUTCOME, NOT THE EXPRESSION. The row below was written by
     * `check_usage_gate` itself, so this compares what the summary claims the
     * window is against what the gate actually enforced it as, rather than
     * against a third copy of the expression retyped in this file, which could
     * only ever agree with whichever of the two it was copied from.
     */
    expect(summary.value.periodStart).toBe(written?.period_start);
  });

  it("computes it with the byte identical expression, in both function bodies", async () => {
    /**
     * THE STRUCTURAL HALF, which the outcome test above cannot cover. The two
     * agree on every ordinary day whatever expression each uses; they can only
     * disagree across a week boundary, which no test can wait for. Comparing
     * the source text catches a future edit to either function on the day it
     * lands rather than on the one Monday a year it would show.
     */
    const rows = await queryAsSuperuser<{ proname: string; def: string }>(
      `select proname, pg_catalog.pg_get_functiondef(oid) as def
         from pg_catalog.pg_proc
        where proname in ('check_usage_gate', 'get_job_search_usage_summary')`,
    );

    expect(rows).toHaveLength(2);

    const expression =
      "pg_catalog.date_trunc(\n    'week', pg_catalog.now() at time zone 'utc'\n  )::date";

    for (const row of rows) {
      expect(
        row.def.includes(expression),
        `${row.proname} no longer computes the week window with the shared expression.`,
      ).toBe(true);
    }
  });
});

describe("one account's usage is never another's (AC-7)", () => {
  it("refuses a caller with no session, before any RPC runs", async () => {
    const summary = await getJobSearchUsageSummary(createCookieJar());

    expect(isFailure(summary)).toBe(true);
    if (!isFailure(summary)) return;
    expect(summary.kind).toBe("session_missing");
  });

  it("gives each account its own number, from one shared function", async () => {
    const busy = await freshSession("usage-summary-busy");
    const quiet = await freshSession("usage-summary-quiet");

    await queryAsSuperuser(
      `insert into public.usage_gate_counter
         (call_type, scope, profile_id, period, period_start,
          attempt_count, consumed_count)
       values ($1, 'account', $2, 'week',
               pg_catalog.date_trunc('week', pg_catalog.now() at time zone 'utc')::date,
               11, 11)`,
      [JOB_SEARCH, busy.userId],
    );

    const busySummary = await getJobSearchUsageSummary(busy.jar);
    const quietSummary = await getJobSearchUsageSummary(quiet.jar);

    if (isFailure(busySummary) || isFailure(quietSummary)) {
      throw new Error("Expected both summaries to succeed.");
    }

    /**
     * BOTH DIRECTIONS ARE ASSERTED. The busy account seeing 11 proves the
     * function found the right row; the quiet account seeing 0 rather than 11
     * proves it is scoped by `auth.uid()` and not returning whatever row it
     * happened to reach. Either assertion alone passes a function that ignores
     * the caller entirely.
     */
    expect(busySummary.value.consumedCount).toBe(11);
    expect(quietSummary.value.consumedCount).toBe(0);
  });
});

describe("the counters stay unreachable from the Data API (AC-8)", () => {
  it("still refuses a signed in caller reading usage_gate_counter directly", async () => {
    const session = await freshSession("usage-summary-grant");
    const supabase = await createClient(session.jar);

    const { data, error } = await supabase
      .from("usage_gate_counter")
      .select("consumed_count");

    /**
     * THE OUTCOME, NOT THE GRANT LIST. Reading `information_schema` would
     * confirm what this migration wrote; this confirms what a real caller can
     * actually do, which is the claim AC-8 makes. Spec 0020 adds a function,
     * not a grant, so the only way to this table is still through one.
     */
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});
