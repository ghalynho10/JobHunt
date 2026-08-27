import { afterAll, describe, expect, it } from "vitest";

import { createClient } from "@/lib/supabase/server";

import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession } from "../helpers/session";

/**
 * Spec 0003, AC-4 and AC-7: guarantees the DATABASE makes, on tables no
 * application code touches yet.
 *
 * WHY THIS FILE EXISTS. The fresh model review of feature 4 on 2026-08-27
 * (`docs/reviews/2026-08-27-feat-data-model.md`) raised one Major: five of the
 * six tables' constraints were proved only by `verify.sql`, a script a person
 * has to paste into a SQL editor and read by eye. A migration that loosened a
 * check, or a policy edit that dropped a `with check` clause, would pass
 * `pnpm typecheck` and `pnpm test` cleanly.
 *
 * It deliberately does NOT port all eighty three checks in `verify.sql`. The
 * review argued against that too, and it is right: `verify.sql` is a better
 * proof of the schema than TypeScript would be. This is the aimed slice it
 * proposed instead, the two regressions a schema refactor is most likely to
 * break silently.
 *
 * `test/integration/isolation.test.ts` proves the same policy family on
 * `profile`. This is a SECOND table, deliberately, because a rule proved on one
 * table says nothing about the twenty three policies applied to the other five.
 */

const mintedUserIds: string[] = [];

/** A signed in user who already has a profile row, ready to own child rows. */
async function userWithProfile(prefix: string, fullName: string) {
  const user = await mintFixtureUser(prefix);
  mintedUserIds.push(user.id);

  const session = await mintSession(user.email);
  const client = await createClient(session.jar);

  const { error } = await client
    .from("profile")
    .insert({ id: user.id, full_name: fullName });

  expect(error).toBeNull();

  return { ...user, client };
}

afterAll(async () => {
  // Every minted user is unique, so this is housekeeping rather than isolation.
  // The cascade from `auth.users` takes the profile and its children with it.
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

describe("an update cannot reach another user's row (AC-4)", () => {
  it("changes zero rows rather than raising, which is the trap", async () => {
    const carol = await userWithProfile("wx-carol", "Carol Fixture");
    const mallory = await userWithProfile("wx-mallory", "Mallory Fixture");

    const { data: inserted, error: insertError } = await carol.client
      .from("work_experience")
      .insert({
        profile_id: carol.id,
        company: "Carol's Employer",
        title: "Engineer",
        started_on: "2024-01-01",
      })
      .select("id, title")
      .single();

    expect(insertError).toBeNull();

    // Mallory aims squarely at Carol's row, by its real id.
    const { data: changed, error: updateError } = await mallory.client
      .from("work_experience")
      .update({ title: "Rewritten by Mallory" })
      .eq("id", inserted?.id ?? "")
      .select("id");

    /**
     * THIS IS THE TRAP, AND IT IS THE WHOLE REASON THIS TEST EXISTS. The policy's
     * `using` clause makes Carol's row invisible to Mallory, so the update
     * matches NOTHING. It does not raise. A test that only asserted "no error"
     * would pass just as happily against a table with no policy at all, and so
     * would a test that only asserted an error was thrown, because none is.
     *
     * The assertion that carries the meaning is the row count.
     */
    expect(updateError).toBeNull();
    expect(changed).toEqual([]);

    // And the row is genuinely untouched, read back by its owner. Without this
    // the check above would still pass if the write had somehow landed and
    // simply returned nothing.
    const { data: afterwards } = await carol.client
      .from("work_experience")
      .select("title")
      .eq("id", inserted?.id ?? "")
      .single();

    expect(afterwards?.title).toBe("Engineer");

    /**
     * THE CONTROL, and it is what stops this test passing for the wrong reason.
     * The SAME statement, aimed at the SAME row, run by the owner, changes
     * exactly one row. So the empty result above is the policy refusing
     * Mallory, not a malformed update, a wrong id, or a filter that never
     * matched anything. Without this, dropping the `where` clause's target or
     * mistyping a column name would produce the same empty array and read as a
     * pass.
     */
    const { data: ownerChanged, error: ownerError } = await carol.client
      .from("work_experience")
      .update({ title: "Renamed by its owner" })
      .eq("id", inserted?.id ?? "")
      .select("id");

    expect(ownerError).toBeNull();
    expect(ownerChanged).toHaveLength(1);
  });

  it("refuses an update that would move a row under another user's profile", async () => {
    const owner = await userWithProfile("wx-owner", "Owner Fixture");
    const target = await userWithProfile("wx-target", "Target Fixture");

    const { data: inserted } = await owner.client
      .from("work_experience")
      .insert({
        profile_id: owner.id,
        company: "Owner's Employer",
        title: "Engineer",
        started_on: "2024-01-01",
      })
      .select("id")
      .single();

    // The owner edits their OWN row, which `using` permits, but hands it to
    // somebody else. This is the half `with check` exists for, and the half a
    // `using` only policy would let through.
    const { error } = await owner.client
      .from("work_experience")
      .update({ profile_id: target.id })
      .eq("id", inserted?.id ?? "");

    /**
     * Refused, not merely hidden. Spec 0003 AC-4 says this in as many words:
     * an update that would place a row under another user's profile is refused
     * by the policy's `with check`, rather than silently doing nothing. So
     * unlike the case above, here an error IS the pass.
     */
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
  });
});

describe("the database refuses a duplicate application (AC-7)", () => {
  /** The minimum an `application` row needs, with pay left absent throughout. */
  function listing(profileId: string, sourceJobId: string) {
    return {
      profile_id: profileId,
      source: "adzuna",
      source_job_id: sourceJobId,
      job_title: "Senior Engineer",
      company_name: "Example Co",
      job_url: "https://example.test/jobs/1",
    };
  }

  it("refuses a second application to the same listing", async () => {
    const user = await userWithProfile("app-dup", "Duplicate Fixture");

    const { error: first } = await user.client
      .from("application")
      .insert(listing(user.id, "job-abc-123"));

    expect(first).toBeNull();

    const { error: second } = await user.client
      .from("application")
      .insert(listing(user.id, "job-abc-123"));

    /**
     * AC-7, invariant 4. The refusal comes from the constraint, so it holds
     * even for a caller that forgot to check first, which is exactly the
     * promise spec 0003 makes to feature 12. 23505 is Postgres
     * `unique_violation`.
     */
    expect(second).not.toBeNull();
    expect(second?.code).toBe("23505");
  });

  it("still lets a different user apply to that same listing", async () => {
    const first = await userWithProfile("app-scope-one", "Scope One");
    const second = await userWithProfile("app-scope-two", "Scope Two");

    const { error: firstError } = await first.client
      .from("application")
      .insert(listing(first.id, "job-shared-999"));

    const { error: secondError } = await second.client
      .from("application")
      .insert(listing(second.id, "job-shared-999"));

    /**
     * The other half of AC-7, and the reason the constraint leads with
     * `profile_id`. A unique constraint written over `(source, source_job_id)`
     * alone would satisfy the test above and quietly stop every user after the
     * first from ever applying to a popular job. That failure would look like
     * a duplicate check working correctly.
     */
    expect(firstError).toBeNull();
    expect(secondError).toBeNull();
  });
});
