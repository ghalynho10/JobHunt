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
import { readSearchPrefill } from "@/features/search/preferences";
import { isFailure } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

import { queryAsSuperuser } from "../helpers/database";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { recordedFetch } from "../helpers/recorder";
import { mintSession } from "../helpers/session";
import { ADZUNA } from "../helpers/services";

/**
 * Search, end to end against the real stack (spec 0013, Critical test
 * scenarios).
 *
 * WHAT IS REAL HERE, WHICH IS ALMOST EVERYTHING. A real minted session, the
 * real `check_usage_gate` function with its real row locks, the real policies,
 * the real `job_preference` table, and the real Zod parse in `adzuna.ts`. The
 * ONE thing controlled is Adzuna's own response, and even that is not invented:
 * the happy path replays the recorded bytes Adzuna actually sent
 * (`test/fixtures/adzuna/`), so the shipped parser meets a real response
 * through its own public entry point.
 *
 * WHY THIS FILE IS IN `integration-serial` RATHER THAN `integration`. Every
 * search here spends the REAL `job_search` budget, and two of those windows
 * (global day, global month) are single shared rows the whole suite sees.
 * `test/integration/usage-gating.test.ts` resets those rows and then asserts
 * they hold exactly one attempt and one consumption, which any concurrent
 * search would break. Files inside `integration` run in parallel, so this file
 * sat beside that assertion and broke it, reproducibly, the first time the
 * whole suite ran together. `integration-serial` starts only once every
 * `integration` file has drained (`sequence.groupOrder: 1`), which removes the
 * race by construction rather than by hoping the timing holds. Same reasoning
 * as `shared-global-state.test.ts` beside it.
 *
 * WHY THE FETCH INTERCEPT IS ADZUNA ONLY. Supabase's client also calls
 * `fetch`, for `getClaims()` and every RPC. Replacing `fetch` wholesale breaks
 * the gate before Adzuna is ever reached, and the tests then fail as
 * `session_missing`, which looks like a real defect and is not. Everything not
 * addressed to `api.adzuna.com` goes to the real network.
 */

const FIXTURE = "search-software-engineer-boston";

const mintedUserIds: string[] = [];
const realFetch = globalThis.fetch;

/** Only Adzuna is intercepted; Supabase's own traffic passes through. */
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

function respondWith(body: string, status = 200) {
  interceptAdzuna(
    async () =>
      new Response(body, {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
}

/** The real bytes Adzuna sent, replayed. Never touches the network. */
async function realAdzunaBody(): Promise<string> {
  const captured = await recordedFetch(ADZUNA, FIXTURE, {
    url: "https://api.adzuna.com/v1/api/jobs/us/search/1",
  });
  return captured.response.bodyText;
}

async function freshSession(prefix: string) {
  const user = await mintFixtureUser(prefix);
  mintedUserIds.push(user.id);
  const session = await mintSession(user.email);
  const supabase = await createClient(session.jar);

  const { error } = await supabase
    .from("profile")
    .insert({ id: user.id, full_name: "Search Fixture" });
  if (error) throw new Error(`Could not seed a profile: ${error.message}`);

  return { session, supabase, user };
}

/** The caller's own consumed count for `job_search`, the real accounting row. */
async function accountSpend(userId: string): Promise<number> {
  const rows = await queryAsSuperuser<{ consumed_count: number }>(
    `select consumed_count from public.usage_gate_counter
      where call_type = 'job_search' and scope = 'account' and profile_id = $1`,
    [userId],
  );
  return rows[0]?.consumed_count ?? 0;
}

beforeEach(() => {
  vi.stubGlobal("fetch", realFetch);
});

afterEach(() => {
  vi.stubGlobal("fetch", realFetch);
});

afterAll(async () => {
  vi.stubGlobal("fetch", realFetch);
  /**
   * The global day and month windows for `job_search` are shared, so a long
   * lived local stack would otherwise creep toward the real 66 a day ceiling
   * and start failing these tests for the wrong window. A missing row is
   * exactly what a fresh window looks like; `check_usage_gate` upserts it back.
   */
  await queryAsSuperuser(
    `delete from public.usage_gate_counter
      where call_type = 'job_search' and scope = 'global'`,
    [],
  );
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

describe("a real search against the recorded Adzuna response (AC-1)", () => {
  it("returns the listings Adzuna actually sent", async () => {
    const { session } = await freshSession("search-ok");
    respondWith(await realAdzunaBody());

    const result = await searchListings({ title: "engineer" }, session.jar);

    if (isFailure(result)) throw new Error(`failed: ${result.kind}`);
    if (!result.value.allowed) throw new Error("unexpectedly refused");

    expect(result.value.value).toHaveLength(20);
    expect(result.value.value[0]?.source).toBe("adzuna");
    expect(result.value.value[0]?.title.length).toBeGreaterThan(0);
    expect(result.value.value[0]?.url).toContain("adzuna.com");
  });

  it("reads the predicted flag Adzuna really sends, as a string (AC-7)", async () => {
    /**
     * THE BUG THIS WHOLE FIXTURE EXISTS FOR. Adzuna's documented example shows
     * `salary_is_predicted: 0`, a number. The live API sends `"1"`, a string.
     * A schema written from the documentation parses the documented shape, and
     * every predicted listing then fails its item parse. Nineteen of twenty
     * listings in a real search are predicted, so the page would render
     * `response_malformed` for a response that was perfectly fine.
     */
    const { session } = await freshSession("search-pred");
    respondWith(await realAdzunaBody());

    const result = await searchListings({ title: "engineer" }, session.jar);

    if (isFailure(result) || !result.value.allowed)
      throw new Error("unexpected");
    expect(result.value.value.some((l) => l.salaryIsPredicted)).toBe(true);
  });

  it("never takes the currency from Adzuna (invariant 3)", async () => {
    const { session } = await freshSession("search-cur");
    respondWith(await realAdzunaBody());

    const result = await searchListings({ title: "engineer" }, session.jar);

    if (isFailure(result) || !result.value.allowed)
      throw new Error("unexpected");
    for (const l of result.value.value) {
      if (l.salaryCurrency !== undefined) expect(l.salaryCurrency).toBe("USD");
    }
  });

  it("spends exactly one gate check per search (AC-10)", async () => {
    const { session, user } = await freshSession("search-spend");
    respondWith(await realAdzunaBody());

    expect(await accountSpend(user.id)).toBe(0);
    await searchListings({ title: "engineer" }, session.jar);
    expect(await accountSpend(user.id)).toBe(1);
    await searchListings({ title: "engineer" }, session.jar);
    expect(await accountSpend(user.id)).toBe(2);
  });
});

describe("a blank query is refused before anything is spent (AC-2)", () => {
  it("fails validation and never calls Adzuna", async () => {
    const { session, user } = await freshSession("search-blank");
    const adzuna = vi.fn();
    interceptAdzuna(async () => {
      adzuna();
      return new Response("{}", { status: 200 });
    });

    const result = await searchListings({}, session.jar);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) expect(result.kind).toBe("validation_failed");
    expect(
      adzuna,
      "a blank query must not reach Adzuna",
    ).not.toHaveBeenCalled();
    expect(await accountSpend(user.id)).toBe(0);
  });

  it("treats whitespace only fields as blank", async () => {
    const { session } = await freshSession("search-ws");

    const result = await searchListings(
      { title: "   ", location: "  " },
      session.jar,
    );

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) expect(result.kind).toBe("validation_failed");
  });

  it("accepts a location with no title", async () => {
    const { session } = await freshSession("search-loconly");
    respondWith(await realAdzunaBody());

    const result = await searchListings({ location: "Boston" }, session.jar);

    expect(isFailure(result)).toBe(false);
  });
});

describe("a refusal from the real gate (AC-3)", () => {
  it("returns the reason and never calls Adzuna when the cap is spent", async () => {
    const { session, user } = await freshSession("search-capped");
    const adzuna = vi.fn();
    interceptAdzuna(async () => {
      adzuna();
      return new Response("{}", { status: 200 });
    });

    /**
     * The account's real weekly window is driven to its cap through the real
     * table rather than by making 25 calls, which would burn the shared global
     * budget to prove an account rule.
     */
    await searchListings({ title: "engineer" }, session.jar);
    await queryAsSuperuser(
      `update public.usage_gate_counter set consumed_count = 25
        where call_type = 'job_search' and scope = 'account' and profile_id = $1`,
      [user.id],
    );
    adzuna.mockClear();

    const result = await searchListings({ title: "engineer" }, session.jar);

    expect(isFailure(result)).toBe(false);
    if (!isFailure(result)) {
      expect(result.value.allowed).toBe(false);
      if (!result.value.allowed) {
        expect(result.value.reason).toBe("account_week_cap_reached");
      }
    }
    expect(adzuna).not.toHaveBeenCalled();
  });

  it("is a success carrying allowed false, never a failure", async () => {
    /**
     * spec 0011 AC-5, through this caller. A refusal reported as a `Failure`
     * would mark the span failed and put a correct refusal into the numerator
     * of the failure rate alert.
     */
    const { session, user } = await freshSession("search-refusal-shape");
    respondWith(await realAdzunaBody());
    await searchListings({ title: "engineer" }, session.jar);
    await queryAsSuperuser(
      `update public.usage_gate_counter set consumed_count = 25
        where call_type = 'job_search' and scope = 'account' and profile_id = $1`,
      [user.id],
    );

    const result = await searchListings({ title: "engineer" }, session.jar);

    expect(isFailure(result)).toBe(false);
  });
});

describe("Adzuna failing (AC-5)", () => {
  it("reports a thrown network error as external_service_failed", async () => {
    const { session } = await freshSession("search-net");
    interceptAdzuna(async () => {
      throw new TypeError("network down");
    });

    const result = await searchListings({ title: "engineer" }, session.jar);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) expect(result.kind).toBe("external_service_failed");
  });

  it("reports a timeout as external_service_failed, not malformed", async () => {
    const { session } = await freshSession("search-timeout");
    interceptAdzuna(async () => {
      throw new DOMException("The operation was aborted.", "TimeoutError");
    });

    const result = await searchListings({ title: "engineer" }, session.jar);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) expect(result.kind).toBe("external_service_failed");
  });

  it("never parses a non success response, however valid its body", async () => {
    /**
     * A 429 is the likely one, given Adzuna's 25 a minute ceiling. `fetch`
     * does not throw on a non success status, so this check is explicit in the
     * code rather than something `attempt()` catches. The body here is a
     * perfectly good listings payload, so only the status can produce the
     * right answer.
     */
    const { session } = await freshSession("search-429");
    respondWith(await realAdzunaBody(), 429);

    const result = await searchListings({ title: "engineer" }, session.jar);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) expect(result.kind).toBe("external_service_failed");
  });

  it("reports a body that is not JSON as response_malformed", async () => {
    const { session } = await freshSession("search-notjson");
    respondWith("<html>maintenance</html>");

    const result = await searchListings({ title: "engineer" }, session.jar);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) expect(result.kind).toBe("response_malformed");
  });

  it("reports a body with no results array as response_malformed", async () => {
    const { session } = await freshSession("search-envelope");
    respondWith(JSON.stringify({ unexpected: true }));

    const result = await searchListings({ title: "engineer" }, session.jar);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) expect(result.kind).toBe("response_malformed");
  });
});

describe("one bad listing does not blank a good page (AC-1, AC-5)", () => {
  it("drops the bad item and renders the rest", async () => {
    /**
     * Feature 19 owns data quality properly. This is the narrower promise: one
     * malformed row among twenty is Adzuna's data, not a broken integration,
     * and it must not cost the reader the other nineteen.
     */
    const { session } = await freshSession("search-partial");
    const real = JSON.parse(await realAdzunaBody()) as {
      results: unknown[];
    };
    respondWith(
      JSON.stringify({ results: [real.results[0], { garbage: true }] }),
    );

    const result = await searchListings({ title: "engineer" }, session.jar);

    if (isFailure(result) || !result.value.allowed)
      throw new Error("unexpected");
    expect(result.value.value).toHaveLength(1);
  });

  it("fails only when every item in a non empty batch fails", async () => {
    const { session } = await freshSession("search-allbad");
    respondWith(JSON.stringify({ results: [{ a: 1 }, { b: 2 }] }));

    const result = await searchListings({ title: "engineer" }, session.jar);

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) expect(result.kind).toBe("response_malformed");
  });

  it("treats a genuinely empty result as success, not as malformed", async () => {
    // covers: AC-4. The empty state and the failure state are different things.
    const { session } = await freshSession("search-empty");
    respondWith(JSON.stringify({ results: [] }));

    const result = await searchListings({ title: "nothing" }, session.jar);

    if (isFailure(result)) throw new Error(`failed: ${result.kind}`);
    if (!result.value.allowed) throw new Error("unexpectedly refused");
    expect(result.value.value).toEqual([]);
  });
});

describe("the item transform, on a real item edited at one field", () => {
  it("drops a listing whose url is not http or https", async () => {
    /**
     * A bare `z.url()` accepts `javascript:alert(1)`, and this value is
     * rendered as an `href` on every card. The scheme restriction added on
     * 2026-09-04 turns a hostile listing into an ordinary dropped item.
     */
    const { session } = await freshSession("search-scheme");
    const real = JSON.parse(await realAdzunaBody()) as {
      results: Record<string, unknown>[];
    };
    respondWith(
      JSON.stringify({
        results: [
          { ...real.results[0], redirect_url: "javascript:alert(1)" },
          real.results[1],
        ],
      }),
    );

    const result = await searchListings({ title: "engineer" }, session.jar);

    if (isFailure(result) || !result.value.allowed)
      throw new Error("unexpected");
    // Dropped and counted, exactly like any other unparseable item, and the
    // good listing beside it still reaches the reader.
    expect(result.value.value).toHaveLength(1);
    expect(result.value.value[0]?.url.startsWith("https://")).toBe(true);
  });
});

describe("the search prefill reads the caller's own row (AC-9)", () => {
  it("returns the first stated title and location", async () => {
    const { session, supabase, user } = await freshSession("prefill-ok");
    const { error } = await supabase.from("job_preference").insert({
      profile_id: user.id,
      desired_titles: ["data engineer", "analyst"],
      desired_locations: ["Boston", "NYC"],
    });
    if (error) throw new Error(error.message);

    const result = await readSearchPrefill(session.jar);

    if (isFailure(result)) throw new Error(`failed: ${result.kind}`);
    expect(result.value).toEqual({
      title: "data engineer",
      location: "Boston",
    });
  });

  it("returns nothing when the caller has no preferences row", async () => {
    // An unset preference is an ordinary early state, never a failure.
    const { session } = await freshSession("prefill-none");

    const result = await readSearchPrefill(session.jar);

    if (isFailure(result)) throw new Error(`failed: ${result.kind}`);
    expect(result.value).toEqual({ title: undefined, location: undefined });
  });

  it("returns nothing when the stated arrays are empty", async () => {
    const { session, supabase, user } = await freshSession("prefill-empty");
    await supabase.from("job_preference").insert({
      profile_id: user.id,
      desired_titles: [],
      desired_locations: [],
    });

    const result = await readSearchPrefill(session.jar);

    if (isFailure(result)) throw new Error(`failed: ${result.kind}`);
    expect(result.value).toEqual({ title: undefined, location: undefined });
  });

  it("spends no gate budget at all", async () => {
    // covers: AC-9. Landing on /search must not cost a search.
    const { session, user } = await freshSession("prefill-free");

    await readSearchPrefill(session.jar);

    expect(await accountSpend(user.id)).toBe(0);
  });

  it("sees only its own row, never another caller's (spec 0003)", async () => {
    /**
     * The policy is what confines this read; there is no `eq` filter in the
     * query. Two real sessions are the only honest way to prove that.
     */
    const other = await freshSession("prefill-other");
    await other.supabase.from("job_preference").insert({
      profile_id: other.user.id,
      desired_titles: ["SOMEBODY ELSE"],
      desired_locations: ["Elsewhere"],
    });

    const mine = await freshSession("prefill-mine");
    const result = await readSearchPrefill(mine.session.jar);

    if (isFailure(result)) throw new Error(`failed: ${result.kind}`);
    expect(result.value.title).toBeUndefined();
  });
});
