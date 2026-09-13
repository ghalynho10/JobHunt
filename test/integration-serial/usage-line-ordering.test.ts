import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { searchListings } from "@/features/search/adzuna";
import { getJobSearchUsageSummary } from "@/lib/usage-gating/queries";
import { isFailure } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

import { queryAsSuperuser } from "../helpers/database";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { recordedFetch } from "../helpers/recorder";
import { mintSession } from "../helpers/session";
import { ADZUNA } from "../helpers/services";

/**
 * Spec 0020's revision, against the real gate and the real counters.
 *
 * WHAT THIS PROVES THAT THE PAGE TEST CANNOT. `src/app/(app)/search/page.test.ts`
 * proves the ORDER: that the usage read runs after this render's own search,
 * using two mocks wired through a shared counter. It cannot prove the NUMBERS,
 * because both sides of it are mocks. This file proves the numbers: a real
 * minted session, the real `check_usage_gate` with its real row locks, the real
 * `usage_gate_counter` rows, and the real `get_job_search_usage_summary`. Read
 * in the order `SearchPage` reads them, it must produce the figure a person
 * actually sees.
 *
 * THE TWO TOGETHER ARE THE PROOF. Neither alone is: the page test would pass
 * against a read that returned a plausible wrong number, and this file would
 * pass against a page that called the two in the wrong order.
 *
 * ONLY ADZUNA IS INTERCEPTED, and the bytes replayed are ones Adzuna really
 * sent (`test/fixtures/adzuna/`). Supabase's own traffic goes to the real local
 * stack, because the gate is the thing under test. Replacing `fetch` wholesale
 * would break `getClaims()` and every RPC, and the failures would read as
 * `session_missing` rather than as the wiring mistake they are. Same reasoning,
 * and the same helper shape, as `search-listings.test.ts` beside it.
 *
 * IT LIVES IN `integration-serial` because every search here spends the real
 * shared `job_search` global windows, which `test/integration/usage-gating.test.ts`
 * asserts exact values on.
 */

const FIXTURE = "search-software-engineer-boston";
const mintedUserIds: string[] = [];
const realFetch = globalThis.fetch;

function interceptAdzuna(handler: () => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("api.adzuna.com")) return handler();
      return realFetch(input, init);
    },
  );
}

async function replayRealAdzuna() {
  const captured = await recordedFetch(ADZUNA, FIXTURE, {
    url: "https://api.adzuna.com/v1/api/jobs/us/search/1",
  });
  interceptAdzuna(
    async () =>
      new Response(captured.response.bodyText, {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
}

async function freshSession(prefix: string) {
  const user = await mintFixtureUser(prefix);
  mintedUserIds.push(user.id);
  const session = await mintSession(user.email);
  const supabase = await createClient(session.jar);
  const { error } = await supabase
    .from("profile")
    .insert({ id: user.id, full_name: "Usage Line Fixture" });
  if (error) throw new Error(`Could not seed a profile: ${error.message}`);
  return { session, user };
}

/** Puts the caller exactly `below` calls short of their account week cap. */
async function seedNearCap(userId: string, below: number): Promise<number> {
  const [cap] = await queryAsSuperuser<{ cap_value: number }>(
    `select cap_value from public.usage_cap
      where call_type = 'job_search' and scope = 'account' and period = 'week'`,
  );

  if (cap === undefined) throw new Error("No job_search account week cap row.");

  await queryAsSuperuser(
    `insert into public.usage_gate_counter
       (call_type, scope, profile_id, period, period_start,
        attempt_count, consumed_count)
     values ('job_search', 'account', $1, 'week',
             pg_catalog.date_trunc('week', pg_catalog.now() at time zone 'utc')::date,
             $2, $2)`,
    [userId, cap.cap_value - below],
  );

  return cap.cap_value;
}

beforeEach(() => vi.stubGlobal("fetch", realFetch));
afterEach(() => vi.stubGlobal("fetch", realFetch));

afterAll(async () => {
  vi.stubGlobal("fetch", realFetch);
  await queryAsSuperuser(
    `delete from public.usage_gate_counter
      where call_type = 'job_search' and scope = 'global'`,
  );
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

describe("the figure a search render shows, against the real gate (AC-11, AC-13)", () => {
  it("reports the cap as reached on the render of the last allowed search", async () => {
    /**
     * THE BOUNDARY CASE, AND THE ONE THAT MATTERS. On 2026-09-11 this exact
     * situation rendered `24 of 25` beside a full page of results, so the
     * person who had just spent their last search was told another remained.
     * The next search was refused.
     */
    const { session, user } = await freshSession("usage-line-boundary");
    const cap = await seedNearCap(user.id, 1);
    await replayRealAdzuna();

    const search = await searchListings(
      { title: "software engineer", location: "Boston" },
      session.jar,
    );

    if (isFailure(search)) {
      throw new Error(`Expected a decision, got a failure: ${search.kind}.`);
    }
    expect(search.value.allowed).toBe(true);

    /** Read in the order `SearchPage` reads it: after the search resolves. */
    const summary = await getJobSearchUsageSummary(session.jar);

    if (isFailure(summary)) {
      throw new Error(`Expected a summary, got a failure: ${summary.kind}.`);
    }

    expect(summary.value.consumedCount).toBe(cap);
    expect(summary.value.capValue).toBe(cap);

    /**
     * AND THE REFUSAL LANDS NEXT, which is what makes the figure above the
     * honest one. Without this the test would only show a number moving; with
     * it, the number is shown to mean what the reader will take it to mean.
     */
    await replayRealAdzuna();
    const next = await searchListings(
      { title: "software engineer", location: "Boston" },
      session.jar,
    );

    if (isFailure(next)) {
      throw new Error(`Expected a decision, got a failure: ${next.kind}.`);
    }
    expect(next.value.allowed).toBe(false);
  });

  it("counts the search, so the figure is never the one from before it", async () => {
    const { session, user } = await freshSession("usage-line-counts");
    await seedNearCap(user.id, 9);
    await replayRealAdzuna();

    const before = await getJobSearchUsageSummary(session.jar);
    if (isFailure(before)) throw new Error("Expected a summary before.");

    const search = await searchListings(
      { title: "software engineer", location: "Boston" },
      session.jar,
    );
    if (isFailure(search)) throw new Error("Expected a decision.");

    const after = await getJobSearchUsageSummary(session.jar);
    if (isFailure(after)) throw new Error("Expected a summary after.");

    /**
     * THE READ MOVES ON PURPOSE, WHICH IS WHAT MAKES IT A READER. A probe that
     * cannot see its source returns the same value before and after, and so
     * does a correct one when nothing happened, so the two are only told apart
     * by making the number move.
     */
    expect(after.value.consumedCount).toBe(before.value.consumedCount + 1);
  });

  it("leaves the figure alone when the search failed at Adzuna, but keeps the spend (AC-14)", async () => {
    /**
     * The gate allowed the call, so the budget went; Adzuna then failed, so the
     * reader got nothing for it. The figure must include that spend, because
     * under reporting here is wrong in the direction that costs the person a
     * search they did not know they had lost.
     */
    const { session, user } = await freshSession("usage-line-adzuna-fail");
    await seedNearCap(user.id, 9);

    const before = await getJobSearchUsageSummary(session.jar);
    if (isFailure(before)) throw new Error("Expected a summary before.");

    interceptAdzuna(
      async () => new Response("upstream is down", { status: 503 }),
    );

    const search = await searchListings(
      { title: "software engineer", location: "Boston" },
      session.jar,
    );
    expect(isFailure(search)).toBe(true);

    const after = await getJobSearchUsageSummary(session.jar);
    if (isFailure(after)) throw new Error("Expected a summary after.");

    expect(after.value.consumedCount).toBe(before.value.consumedCount + 1);
  });
});

describe("neither security definer function is reachable by anon (AC-15)", () => {
  /**
   * NOTHING PINNED THESE BEFORE. Spec 0011's own scenarios exercise the
   * wrapper's session handling rather than the grant, and this feature's
   * function had its ACL read once by hand during `/check verify`, which says
   * nothing about tomorrow. Both are checked here so a future migration that
   * recreates either one, and forgets its `revoke`, fails a test rather than
   * quietly widening who can spend budget.
   */
  it.each(["check_usage_gate", "get_job_search_usage_summary"])(
    "refuses anon on %s",
    async (fn) => {
      const rows = await queryAsSuperuser<{ allowed: boolean }>(
        `select pg_catalog.has_function_privilege('anon', p.oid, 'execute') as allowed
           from pg_catalog.pg_proc as p
           join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = $1`,
        [fn],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]?.allowed).toBe(false);
    },
  );

  it("still grants execute to authenticated on both", async () => {
    /**
     * THE OTHER HALF, AND IT IS NOT REDUNDANT. A migration that revoked from
     * everybody would pass the refusal check above while breaking every gated
     * call in the product, so the test that proves the door is shut also has to
     * prove it opens for the right caller.
     */
    const rows = await queryAsSuperuser<{ proname: string; allowed: boolean }>(
      `select p.proname,
              pg_catalog.has_function_privilege('authenticated', p.oid, 'execute') as allowed
         from pg_catalog.pg_proc as p
         join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('check_usage_gate', 'get_job_search_usage_summary')`,
    );

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(
        row.allowed,
        `${row.proname} is not executable by authenticated`,
      ).toBe(true);
    }
  });
});
