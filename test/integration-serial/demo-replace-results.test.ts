import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { DEMO_SEARCHES } from "@/features/demo/refresh";

import { devOnlyAdminClient } from "../helpers/admin";

/**
 * `replace_demo_results()`, reached the way the application reaches it (spec
 * 0021, AC-17).
 *
 * IT GOES THROUGH THE SECRET KEY CLIENT, DELIBERATELY, AND THAT IS THE WHOLE
 * POINT OF THE FILE. `test/helpers/database.ts` is a direct superuser
 * connection, and the one bug this function has already shipped is invisible
 * from there: Supabase turns on the `safeupdate` guard for the connection
 * PostgREST serves requests over, which refuses any DELETE carrying no WHERE
 * clause. A bare `delete from public.demo_result;` runs perfectly from psql as
 * the superuser and fails EVERY application call. It was found on the first
 * real refresh, after the two searches and all 32 model calls had already been
 * paid for. A test on the superuser connection would have been green for that
 * exact version of this function, which is worse than no test: it would have
 * been cited as evidence the write path worked.
 *
 * `devOnlyAdminClient()` returns `createSecretClient()`, the same client
 * `writeDemoResults()` builds, so the `rpc()` call below travels the same
 * PostgREST path with the same guard switched on. Binding rule 1 is respected:
 * this is the test layer's one sanctioned door to that client.
 *
 * NO VENDOR CALL AND NO REFRESH RUNS HERE. The rows are handwritten, because
 * what is under test is the transaction, not the scoring that produces its
 * input. The paid end to end run already happened and its numbers are in
 * `docs/experiments/0021-seeded-demo-account.md`.
 *
 * IT LEAVES THE TABLES AS IT FOUND THEM. `demo_result` is emptied and
 * `demo_refresh` is put back to the migration's seeded row (both queries
 * named, `refreshed_at` null), so a later `pnpm test:integration` on the same
 * stack starts where this one did.
 *
 * WHY IT LIVES IN `test/integration-serial/`, NOT `test/integration/`. It
 * EMPTIES `demo_result` in `beforeEach` and rewrites the `demo_refresh`
 * singleton, and both are global tables rather than rows scoped to a minted
 * fixture user: there is no per test isolation available here, because the
 * write path under test is a wholesale replace by design (AC-17). Nothing in
 * `test/integration/**` reads those two tables TODAY, so no race exists yet,
 * and that is exactly the condition this placement stops depending on. Files in
 * that project run in parallel by default, so a later test reading `/demo`'s
 * data would land inside this file's delete and replace window and fail for
 * reasons nothing in its own code explains. `groupOrder: 1` plus this project's
 * `fileParallelism: false` (`vitest.config.mts`) mean every `integration` file
 * and its cleanup have finished before this one starts. Same reasoning as the
 * moves made for `usage-cap-descriptions.test.ts`, `usage-summary.test.ts` and
 * `model-client-router-usage-cap.test.ts`, whose own race was real and took
 * three runs in ten to show itself. A comment claiming exclusive ownership
 * would have protected nothing: this project's own config comment makes the
 * point that a rule left to a comment is one somebody has to read first.
 */

const supabase = devOnlyAdminClient();

/**
 * A uuid no row will ever hold, so `neq` matches every row.
 *
 * A FILTER IS REQUIRED HERE FOR THE SAME REASON THE FUNCTION CARRIES `where
 * true`: this client is the one `safeupdate` guards, and a delete with no
 * filter is refused. `id` is a uuid column, so the sentinel has to be uuid
 * shaped or PostgREST rejects the value before the guard is ever reached.
 */
const NO_SUCH_ID = "00000000-0000-0000-0000-000000000000";

const [BACKEND, FRONTEND] = DEMO_SEARCHES;
const SEARCH_TITLES = [BACKEND.title, FRONTEND.title];

/** One valid row, in the exact shape `jsonb_to_recordset` unpacks. */
function row(overrides: Record<string, unknown> = {}) {
  return {
    persona_slug: "backend-engineer",
    source_job_id: "replace-test-1",
    sort_order: 1,
    search_title: BACKEND.title,
    title: "Platform Engineer",
    company_name: "Example Systems",
    location: "Remote",
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_is_predicted: false,
    description_snippet: "A posting written for a test, never shown to anyone.",
    band: "possible_match",
    matched_skills: ["Go"],
    not_mentioned_skills: ["Kubernetes"],
    ungrounded_skills: [],
    reasoning: "A fixture verdict, written by hand for an integration test.",
    ...overrides,
  };
}

/** Calls the function exactly as `writeDemoResults()` does. */
async function replace(
  rows: readonly ReturnType<typeof row>[],
  searchLocation?: string,
) {
  return supabase.rpc("replace_demo_results", {
    p_results: rows as never,
    p_search_titles: SEARCH_TITLES,
    ...(searchLocation === undefined
      ? {}
      : { p_search_location: searchLocation }),
  });
}

/** Every stored result row, in the page's own order. */
async function storedResults() {
  const { data, error } = await supabase
    .from("demo_result")
    .select("*")
    .order("persona_slug")
    .order("sort_order");

  expect(error).toBeNull();

  return data ?? [];
}

/** The singleton refresh row. */
async function storedRefresh() {
  const { data, error } = await supabase
    .from("demo_refresh")
    .select("*")
    .eq("id", 1)
    .single();

  expect(error).toBeNull();

  return data;
}

beforeEach(async () => {
  /**
   * `neq` RATHER THAN A BARE DELETE, for the same `safeupdate` reason the
   * function itself carries `where true`. A delete with no filter through this
   * client is refused, which would make the setup fail for the very reason the
   * test below exists to catch, and in a place nobody would look.
   */
  const { error } = await supabase
    .from("demo_result")
    .delete()
    .neq("id", NO_SUCH_ID);

  expect(error).toBeNull();
});

afterAll(async () => {
  await supabase.from("demo_result").delete().neq("id", NO_SUCH_ID);

  // Back to the migration's own seeded row: both queries named, never run.
  await supabase
    .from("demo_refresh")
    .update({
      search_titles: SEARCH_TITLES,
      search_location: null,
      refreshed_at: null,
    })
    .eq("id", 1);
});

describe("the bare delete guard (safeupdate)", () => {
  /**
   * THE REGRESSION THIS FILE EXISTS FOR. Removing `where true` from the
   * function's delete passes `pnpm typecheck`, passes every superuser test, and
   * breaks every real refresh. This test fails the moment that happens, and it
   * costs nothing to run.
   */
  it("completes a replace over existing rows without being refused", async () => {
    const seeded = await replace([row()]);

    expect(seeded.error).toBeNull();

    // The second call is the one that has to delete something.
    const { error } = await replace([row({ source_job_id: "replace-test-2" })]);

    expect(error).toBeNull();
    expect(await storedResults()).toHaveLength(1);
  });

  it("proves the guard is on, so the test above is not vacuous", async () => {
    /**
     * WITHOUT THIS, THE TEST ABOVE CANNOT TELL A WORKING GUARD FROM AN ABSENT
     * ONE: it passes either way, and would have passed on the broken version if
     * this connection did not enforce `safeupdate`. A bare delete through the
     * same client must be refused, which is what makes "the function's delete
     * completed" meaningful evidence rather than a reassuring word.
     */
    await replace([row()]);

    const { error } = await supabase.from("demo_result").delete();

    expect(error).not.toBeNull();
    expect(await storedResults()).toHaveLength(1);
  });
});

describe("wholesale replacement, never a merge (AC-17)", () => {
  it("removes rows the new run did not return", async () => {
    await replace([
      row({ source_job_id: "old-a", sort_order: 1 }),
      row({ source_job_id: "old-b", sort_order: 2 }),
    ]);

    await replace([row({ source_job_id: "new-a", sort_order: 1 })]);

    const stored = await storedResults();

    expect(stored.map((entry) => entry.source_job_id)).toEqual(["new-a"]);
  });

  it("writes every row of a full two persona set", async () => {
    const rows = [
      row({
        persona_slug: "backend-engineer",
        source_job_id: "j1",
        sort_order: 1,
      }),
      row({
        persona_slug: "backend-engineer",
        source_job_id: "j2",
        sort_order: 2,
        search_title: FRONTEND.title,
      }),
      row({
        persona_slug: "frontend-engineer",
        source_job_id: "j1",
        sort_order: 1,
      }),
      row({
        persona_slug: "frontend-engineer",
        source_job_id: "j2",
        sort_order: 2,
        search_title: FRONTEND.title,
      }),
    ];

    const { error } = await replace(rows);

    expect(error).toBeNull();
    expect(await storedResults()).toHaveLength(4);
  });

  it("stores each column as it was sent, not as a default", async () => {
    await replace([
      row({
        source_job_id: "columns",
        location: null,
        salary_min: 150000,
        salary_max: 190000,
        salary_currency: "USD",
        salary_is_predicted: true,
        matched_skills: ["Go", "PostgreSQL"],
        not_mentioned_skills: ["AWS"],
        ungrounded_skills: ["Rust"],
      }),
    ]);

    const [stored] = await storedResults();

    expect(stored?.location).toBeNull();
    expect(Number(stored?.salary_min)).toBe(150000);
    expect(Number(stored?.salary_max)).toBe(190000);
    expect(stored?.salary_currency).toBe("USD");
    expect(stored?.salary_is_predicted).toBe(true);
    expect(stored?.matched_skills).toEqual(["Go", "PostgreSQL"]);
    expect(stored?.not_mentioned_skills).toEqual(["AWS"]);
    expect(stored?.ungrounded_skills).toEqual(["Rust"]);
  });
});

describe("the refresh singleton", () => {
  it("stamps refreshed_at and both query titles in order", async () => {
    const before = Date.now();

    await replace([row()]);

    const refresh = await storedRefresh();

    expect(refresh?.search_titles).toEqual(SEARCH_TITLES);
    expect(refresh?.search_location).toBeNull();
    expect(refresh?.refreshed_at).not.toBeNull();

    const stamped = new Date(refresh?.refreshed_at ?? "").getTime();

    expect(stamped).toBeGreaterThanOrEqual(before - 60_000);
  });

  it("updates the existing row rather than adding a second one", async () => {
    await replace([row()]);
    await replace([row({ source_job_id: "second-run" })]);

    const { data, error } = await supabase.from("demo_refresh").select("id");

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("moves refreshed_at forward on a later run", async () => {
    await replace([row()]);
    const first = (await storedRefresh())?.refreshed_at ?? "";

    await replace([row({ source_job_id: "later" })]);
    const second = (await storedRefresh())?.refreshed_at ?? "";

    expect(new Date(second).getTime()).toBeGreaterThanOrEqual(
      new Date(first).getTime(),
    );
  });

  it("records a location when one is given", async () => {
    await replace([row()], "Chicago, IL");

    expect((await storedRefresh())?.search_location).toBe("Chicago, IL");
  });
});

describe("all or nothing (AC-17)", () => {
  /**
   * ONE BAD ROW MUST TAKE THE WHOLE CALL WITH IT, INCLUDING THE DELETE. The
   * delete runs first inside the function, so a partially applied call is
   * exactly the state that would leave the page empty with a stale
   * `refreshed_at`: real data gone, nothing to replace it, and nothing
   * anywhere reporting a failure.
   */
  it("keeps the previous results when a row violates a constraint", async () => {
    await replace([row({ source_job_id: "survivor" })]);

    const { error } = await replace([
      row({ source_job_id: "good", sort_order: 1 }),
      row({ source_job_id: "bad", sort_order: 2, band: "not_a_real_band" }),
    ]);

    expect(error).not.toBeNull();

    const stored = await storedResults();

    expect(stored.map((entry) => entry.source_job_id)).toEqual(["survivor"]);
  });

  it("leaves refreshed_at unmoved when the insert fails", async () => {
    await replace([row({ source_job_id: "survivor" })]);
    const before = (await storedRefresh())?.refreshed_at;

    await replace([row({ source_job_id: "bad", reasoning: "   " })]);

    expect((await storedRefresh())?.refreshed_at).toBe(before);
  });

  it("refuses a duplicate persona and job id pair as one failed call", async () => {
    await replace([row({ source_job_id: "survivor" })]);

    const { error } = await replace([
      row({ source_job_id: "same", sort_order: 1 }),
      row({ source_job_id: "same", sort_order: 2 }),
    ]);

    expect(error).not.toBeNull();
    expect((await storedResults()).map((entry) => entry.source_job_id)).toEqual(
      ["survivor"],
    );
  });
});

describe("the tables answer to nobody else (AC-4)", () => {
  /**
   * THE GRANTS ARE LOAD BEARING AND THIS IS THE CHEAP HALF OF PROVING IT. The
   * function is `security invoker`, so it has no privilege of its own: if the
   * `insert` and `delete` grants to `service_role` were ever revoked, every
   * refresh would fail and this call is where it would show.
   */
  it("lets the secret key client read back what it wrote", async () => {
    await replace([row({ source_job_id: "readback" })]);

    const stored = await storedResults();

    expect(stored).toHaveLength(1);
    expect(stored[0]?.source_job_id).toBe("readback");
  });
});
