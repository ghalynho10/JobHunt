import { afterAll, describe, expect, it } from "vitest";

import { checkUsageGate } from "@/features/usage-gating/gate";
import { isFailure } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

import { createCookieJar } from "../helpers/cookie-jar";
import { queryAsSuperuser } from "../helpers/database";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession } from "../helpers/session";

/**
 * Spec 0011: the atomic usage gate against the real local stack.
 *
 * WHY THIS NEEDS THE STACK. AC-1's atomicity, AC-2's "no budget consumed on
 * refusal", and AC-9's unconditional attempt count are all guarantees the
 * database itself provides, through `check_usage_gate`'s row locks and its
 * partial unique indexes. A unit test with a mocked RPC response would encode
 * the same assumption the function exists to enforce, exactly the kind of
 * mock the project's own test rule forbids.
 *
 * A DEDICATED TEST CALL TYPE (`gate_test`) IS USED FOR THE CONFIGURATION AND
 * PRECEDENCE SCENARIOS, with its own tiny caps, rather than the real seeded
 * `job_search` caps. Exhausting `job_search`'s real 66 a day / 2000 a month
 * global windows just to prove a precedence rule would burn real, shared
 * local budget for no reason; `job_search` itself is still exercised directly
 * for the happy path and the account window burst below, matching the
 * scenarios spec 0011's own `verify.md` describes.
 */

const JOB_SEARCH = "job_search";
const TEST_CALL_TYPE = "gate_test";

const mintedUserIds: string[] = [];

async function freshUser(prefix: string) {
  const user = await mintFixtureUser(prefix);
  mintedUserIds.push(user.id);
  return user;
}

/**
 * A minted session for a fresh user WITH a `profile` row already in place.
 *
 * `usage_gate_counter.profile_id` references `public.profile (id)` (spec
 * 0011's own data model), so an account scoped gate call for a user with no
 * profile row is refused by that foreign key, not by anything this feature
 * decides. `mintFixtureUser()` mints the auth user only; every other
 * integration test that needs a real profile inserts one itself the same way
 * (see `test/integration/profile-actions.test.ts`).
 */
async function freshSession(prefix: string) {
  const user = await freshUser(prefix);
  const session = await mintSession(user.email);
  const supabase = await createClient(session.jar);

  const { error } = await supabase
    .from("profile")
    .insert({ id: user.id, full_name: "Usage Gate Fixture" });

  if (error) {
    throw new Error(
      `Could not seed a profile row for ${user.id}: ${error.message}`,
    );
  }

  return session;
}

/**
 * Resets `job_search`'s real, shared global windows.
 *
 * WHY THIS IS NEEDED, AND WHY IT IS SAFE. The happy path and burst scenarios
 * below deliberately exercise the real seeded `job_search` caps (matching
 * spec 0011's own `verify.md`), so every run against a long lived local stack
 * consumes a little of the real global day and month budget. Left alone,
 * enough repeated runs push the global day cap (66) to its ceiling and a
 * test that means to prove the ACCOUNT window's cap starts failing for the
 * GLOBAL window instead. Deleting these two rows is safe: a missing window
 * row is exactly what a fresh window looks like (`check_usage_gate` upserts
 * it back into existence on the next call), and nothing else in this suite
 * or any other integration file touches `job_search`'s global counters.
 */
async function resetJobSearchGlobalWindows() {
  await queryAsSuperuser(
    `delete from public.usage_gate_counter
      where call_type = $1 and scope = 'global'`,
    [JOB_SEARCH],
  );
}

/** Today's UTC calendar date, matching `check_usage_gate`'s own day window. */
function utcDayStart(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The first of the current UTC month, matching the month window. */
function utcMonthStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

/** The account week window's current counters for one user and call type. */
async function accountWeekCounters(callType: string, profileId: string) {
  const rows = await queryAsSuperuser<{
    attempt_count: number;
    consumed_count: number;
  }>(
    `select attempt_count, consumed_count from public.usage_gate_counter
      where call_type = $1 and scope = 'account' and profile_id = $2
        and period = 'week'
      order by period_start desc limit 1`,
    [callType, profileId],
  );
  return rows[0];
}

afterAll(async () => {
  await queryAsSuperuser(
    `delete from public.usage_gate_counter where call_type = $1`,
    [TEST_CALL_TYPE],
  );
  await queryAsSuperuser(`delete from public.usage_cap where call_type = $1`, [
    TEST_CALL_TYPE,
  ]);
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

describe("under cap, a call is allowed and every window's counters move (AC-1, AC-9)", () => {
  it("increments attempt and consumed on the caller's own window", async () => {
    await resetJobSearchGlobalWindows();
    const session = await freshSession("gate-happy-path");

    const result = await checkUsageGate(JOB_SEARCH, session.jar);

    if (isFailure(result)) {
      throw new Error(`Expected a decision, got a failure: ${result.kind}.`);
    }

    expect(result.value).toEqual({ allowed: true });

    const counters = await accountWeekCounters(JOB_SEARCH, session.userId);

    expect(counters).toEqual({ attempt_count: 1, consumed_count: 1 });
  });
});

describe("a concurrent burst never lets more than the cap through (AC-1, AC-2)", () => {
  it("allows exactly the account weekly cap's worth and refuses the rest, counting every attempt", async () => {
    await resetJobSearchGlobalWindows();
    const session = await freshSession("gate-burst");

    /**
     * 30 concurrent calls against a cap of 25 (the seeded `job_search`
     * account/week value), sized against numbers confirmed on the running
     * local stack rather than assumed: `authenticated`'s `statement_timeout`
     * is 8s (`select rolconfig from pg_roles where rolname = 'authenticated'`),
     * and the local PostgREST instance logs "Connection Pool initialized with
     * a maximum size of 10 connections" on startup (`docker logs
     * supabase_rest_jobhunt`, postgrest v14.15). 30 requests against a pool of
     * 10 queue in at most three waves; each `check_usage_gate` call is one
     * short transaction (well under 100ms locally), so even three waves stay
     * an order of magnitude under the 8s statement timeout, with no risk of
     * tripping PostgREST's own pool acquisition timeout either.
     */
    const CONCURRENT_CALLS = 30;
    const ACCOUNT_WEEK_CAP = 25;

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_CALLS }, () =>
        checkUsageGate(JOB_SEARCH, session.jar),
      ),
    );

    for (const result of results) {
      if (isFailure(result)) {
        throw new Error(`Expected a decision, got a failure: ${result.kind}.`);
      }
    }

    const decided = results.map((result) =>
      isFailure(result) ? undefined : result.value,
    );

    const allowed = decided.filter((decision) => decision?.allowed === true);
    const refused = decided.filter((decision) => decision?.allowed === false);

    expect(allowed).toHaveLength(ACCOUNT_WEEK_CAP);
    expect(refused).toHaveLength(CONCURRENT_CALLS - ACCOUNT_WEEK_CAP);

    for (const decision of refused) {
      expect(decision).toEqual({
        allowed: false,
        reason: "account_week_cap_reached",
      });
    }

    const counters = await accountWeekCounters(JOB_SEARCH, session.userId);

    expect(counters).toEqual({
      attempt_count: CONCURRENT_CALLS,
      consumed_count: ACCOUNT_WEEK_CAP,
    });
  });
});

describe("an unrecognised or partially configured call_type is refused as misconfigured (AC-6)", () => {
  it("reports usage_gate_misconfigured for a call_type with no usage_cap rows at all", async () => {
    const session = await freshSession("gate-unconfigured");

    const result = await checkUsageGate(
      "no_such_call_type_at_all",
      session.jar,
    );

    if (!isFailure(result)) {
      throw new Error(
        "Expected a failure for an unrecognised call_type, got a decision.",
      );
    }

    expect(result.kind).toBe("usage_gate_misconfigured");
    expect(result.severity).toBe("unexpected");
  });

  it("reports the same failure when only some of the three required rows exist", async () => {
    const session = await freshSession("gate-partial-config");

    await queryAsSuperuser(
      `insert into public.usage_cap (call_type, scope, period, cap_value)
       values ($1, 'account', 'week', 5)
       on conflict (call_type, scope, period) do nothing`,
      [TEST_CALL_TYPE],
    );

    try {
      const result = await checkUsageGate(TEST_CALL_TYPE, session.jar);

      if (!isFailure(result)) {
        throw new Error(
          "Expected a failure for a partially configured call_type, got a decision.",
        );
      }

      expect(result.kind).toBe("usage_gate_misconfigured");
    } finally {
      await queryAsSuperuser(
        `delete from public.usage_cap where call_type = $1`,
        [TEST_CALL_TYPE],
      );
    }
  });
});

describe("the refusal reason follows precedence: the caller's own window first (AC-3)", () => {
  it("reports account_week_cap_reached even when the global windows are also exhausted", async () => {
    const session = await freshSession("gate-precedence");

    /**
     * Both windows exhausted at once, on a call type nothing else in this
     * suite touches, so the real `job_search` budget is never spent proving
     * an ordering rule.
     */
    await queryAsSuperuser(
      `insert into public.usage_cap (call_type, scope, period, cap_value) values
         ($1, 'account', 'week', 1),
         ($1, 'global', 'day', 1),
         ($1, 'global', 'month', 1000)
       on conflict (call_type, scope, period) do update set cap_value = excluded.cap_value`,
      [TEST_CALL_TYPE],
    );

    try {
      const first = await checkUsageGate(TEST_CALL_TYPE, session.jar);
      if (isFailure(first)) {
        throw new Error(`First call unexpectedly failed: ${first.kind}.`);
      }
      expect(first.value).toEqual({ allowed: true });

      const second = await checkUsageGate(TEST_CALL_TYPE, session.jar);
      if (isFailure(second)) {
        throw new Error(`Second call unexpectedly failed: ${second.kind}.`);
      }

      // Both the account week cap (1) and the global day cap (1) are now
      // spent, so this proves the precedence rule rather than just "some cap".
      expect(second.value).toEqual({
        allowed: false,
        reason: "account_week_cap_reached",
      });
    } finally {
      await queryAsSuperuser(
        `delete from public.usage_gate_counter where call_type = $1`,
        [TEST_CALL_TYPE],
      );
      await queryAsSuperuser(
        `delete from public.usage_cap where call_type = $1`,
        [TEST_CALL_TYPE],
      );
    }
  });
});

describe("a global window is checked in isolation, and reported even though the account window is healthy (AC-3, AC-6)", () => {
  const GLOBAL_DAY_CAP = 66;
  const GLOBAL_MONTH_CAP = 2000;

  /**
   * The same dedicated call type and cleanup pattern as the precedence test
   * above, with `job_search`'s own real cap values so the seeded numbers mean
   * something, without ever touching `job_search`'s real, shared counters.
   */
  async function withDedicatedCaps<T>(run: () => Promise<T>): Promise<T> {
    await queryAsSuperuser(
      `insert into public.usage_cap (call_type, scope, period, cap_value) values
         ($1, 'account', 'week', 25),
         ($1, 'global', 'day', $2),
         ($1, 'global', 'month', $3)
       on conflict (call_type, scope, period) do update set cap_value = excluded.cap_value`,
      [TEST_CALL_TYPE, GLOBAL_DAY_CAP, GLOBAL_MONTH_CAP],
    );

    try {
      return await run();
    } finally {
      await queryAsSuperuser(
        `delete from public.usage_gate_counter where call_type = $1`,
        [TEST_CALL_TYPE],
      );
      await queryAsSuperuser(
        `delete from public.usage_cap where call_type = $1`,
        [TEST_CALL_TYPE],
      );
    }
  }

  it("reports global_day_cap_reached when only the global day window is already full", () =>
    withDedicatedCaps(async () => {
      const session = await freshSession("gate-global-day");

      /**
       * Seeded AT the cap, not one below it. `check_usage_gate` refuses once
       * `consumed_count >= cap_value`: at 65 (one below 66) the next call
       * would be the cap's own 66th, still allowed, and would not prove
       * anything was refused. At 66 the window has already handed out every
       * call the cap permits, so the next one is the first to be refused.
       */
      await queryAsSuperuser(
        `insert into public.usage_gate_counter
           (call_type, scope, profile_id, period, period_start, attempt_count, consumed_count)
         values ($1, 'global', null, 'day', $2, $3, $3)
         on conflict (call_type, period, period_start) where scope = 'global'
         do update set attempt_count = excluded.attempt_count,
                        consumed_count = excluded.consumed_count`,
        [TEST_CALL_TYPE, utcDayStart(), GLOBAL_DAY_CAP],
      );

      const result = await checkUsageGate(TEST_CALL_TYPE, session.jar);

      if (isFailure(result)) {
        throw new Error(`Expected a decision, got a failure: ${result.kind}.`);
      }

      expect(result.value).toEqual({
        allowed: false,
        reason: "global_day_cap_reached",
      });

      /**
       * AC-3's inverse of the precedence test above: this is the account
       * window's first ever call (healthy, nowhere near its cap of 25), yet
       * the reported reason is still the global one, because that is the
       * window actually at fault. Also incidentally reconfirms AC-2: the
       * attempt is counted, but nothing is consumed, on a refusal.
       */
      const counters = await accountWeekCounters(
        TEST_CALL_TYPE,
        session.userId,
      );
      expect(counters).toEqual({ attempt_count: 1, consumed_count: 0 });
    }));

  it("reports global_month_cap_reached when only the global month window is already full", () =>
    withDedicatedCaps(async () => {
      const session = await freshSession("gate-global-month");

      await queryAsSuperuser(
        `insert into public.usage_gate_counter
           (call_type, scope, profile_id, period, period_start, attempt_count, consumed_count)
         values ($1, 'global', null, 'month', $2, $3, $3)
         on conflict (call_type, period, period_start) where scope = 'global'
         do update set attempt_count = excluded.attempt_count,
                        consumed_count = excluded.consumed_count`,
        [TEST_CALL_TYPE, utcMonthStart(), GLOBAL_MONTH_CAP],
      );

      const result = await checkUsageGate(TEST_CALL_TYPE, session.jar);

      if (isFailure(result)) {
        throw new Error(`Expected a decision, got a failure: ${result.kind}.`);
      }

      expect(result.value).toEqual({
        allowed: false,
        reason: "global_month_cap_reached",
      });

      const counters = await accountWeekCounters(
        TEST_CALL_TYPE,
        session.userId,
      );
      expect(counters).toEqual({ attempt_count: 1, consumed_count: 0 });
    }));
});

/**
 * AC-14's `{ data: null, error: null }` case is deliberately NOT here: it
 * cannot be produced by the real stack. `.single()` either returns the one
 * row `check_usage_gate` always emits via `return query select ...`, or
 * PostgREST turns zero or multiple rows into an `error` (`PGRST116`), so there
 * is no real request that lands on that exact shape to drive against. It is a
 * unit test instead, in `src/features/usage-gating/gate.test.ts`, extending
 * the same mocked client already used there for the kill switch outcomes:
 * that test is proving `checkUsageGate()`'s own defensive read of the
 * response, not anything the database itself does.
 */
describe("a database fault while writing the counters fails closed (AC-14)", () => {
  /**
   * `job_search` is safe to use here even though the call is expected to
   * fail: the revoke breaks the very first statement inside
   * `check_usage_gate`, so the whole transaction rolls back and nothing is
   * ever written, real budget included.
   */
  it("returns database_unavailable when the function's own table access is revoked mid test", async () => {
    const session = await freshSession("gate-db-fault-revoked");

    /**
     * `check_usage_gate` is `SECURITY DEFINER`, owned by `postgres`, which is
     * BYPASSRLS but confirmed NOT a superuser on this stack (`select rolsuper,
     * rolbypassrls from pg_roles where rolname = 'postgres'` → f, t) — the same
     * split spec 0002's own verify.md documents for the hosted project.
     * BYPASSRLS bypasses row level security only, never table privileges, so
     * revoking the owner's own INSERT and UPDATE genuinely breaks the
     * function's very first statement (the unconditional attempt bump),
     * confirmed by hand before writing this test: the same revoke against a
     * probe row raised a real `permission denied for table
     * usage_gate_counter`, not a silent no-op.
     */
    await queryAsSuperuser(
      `revoke insert, update on public.usage_gate_counter from postgres`,
    );

    try {
      const result = await checkUsageGate(JOB_SEARCH, session.jar);

      if (!isFailure(result)) {
        throw new Error(
          "Expected database_unavailable once the function's own table access was revoked, got a decision.",
        );
      }

      expect(result.kind).toBe("database_unavailable");
      expect(result.severity).toBe("unexpected");

      /**
       * `42501` is Postgres's `insufficient_privilege`, and it only ever
       * lands in `context.code` on the branch that reads the `.rpc()`
       * response's own `error` field (AC-14), which returns before
       * `configured`, `allowed` or `reason` is read at all. The
       * `usage_gate_misconfigured` branch's context carries no `code`, so
       * this also proves which branch was actually taken, not merely that
       * some failure occurred.
       */
      expect(result.context?.["code"]).toBe("42501");
    } finally {
      await queryAsSuperuser(
        `grant insert, update on public.usage_gate_counter to postgres`,
      );
    }
  });
});

/**
 * AC-4 and AC-5's two kill switch outcomes are proved in
 * `src/features/usage-gating/gate.test.ts` instead, as a unit test mocking
 * `readKillSwitch()`, NOT here. `app_settings` is a single global row every
 * integration file's process shares, `kill-switch.test.ts` included, and
 * Vitest runs integration files in parallel: flipping the real switch here
 * raced that file's own assumption that a fresh stack reads `enabled: false`.
 * `readKillSwitch()` itself is already proved against the real row in
 * `test/integration/kill-switch.test.ts`; this feature only needs to prove it
 * branches correctly on that read, which needs no database at all.
 */

describe("identity: no session, no decision (AC-13)", () => {
  it("returns session_missing for a caller with no session at all", async () => {
    const result = await checkUsageGate(JOB_SEARCH, createCookieJar());

    if (!isFailure(result)) {
      throw new Error("Expected session_missing, got a decision.");
    }

    expect(result.kind).toBe("session_missing");
    expect(result.severity).toBe("expected");
  });
});
