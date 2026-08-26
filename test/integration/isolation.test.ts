import { afterAll, describe, expect, it } from "vitest";

import { createClient } from "@/lib/supabase/server";

import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession } from "../helpers/session";

/**
 * Spec 0004, AC-1: the proof the whole test foundation exists for.
 *
 * A user writes a row, a DIFFERENT user looks for it, and cannot find it. Real
 * sessions, the real local stack, the real row level security policies, and the
 * application's own request scoped client throughout.
 *
 * WHY THIS IS BUILT THE HARD WAY. The reference project's worst bug survived
 * six passing tests that all mocked the same wrong assumption. Nothing here is
 * mocked, and nothing here builds a Supabase client of its own: every read and
 * write goes through `createClient()` from `src/lib/supabase/server.ts`, the
 * same module every page and Server Action drives. A break in that wiring
 * breaks this test, rather than leaving a parallel implementation passing.
 */

const mintedUserIds: string[] = [];

async function freshUser(prefix: string) {
  const user = await mintFixtureUser(prefix);
  mintedUserIds.push(user.id);
  return user;
}

afterAll(async () => {
  // Every minted user is unique, so this is housekeeping rather than isolation.
  // Without it a local database accumulates a row per test run forever.
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

describe("row level security confines each user to their own rows", () => {
  it("hides one user's written profile from another user", async () => {
    const alice = await freshUser("alice");
    const bob = await freshUser("bob");

    const aliceSession = await mintSession(alice.email);
    const aliceClient = await createClient(aliceSession.jar);

    // AC-1: the write goes through the request scoped client, under the real
    // insert policy. Driving a Server Action without a browser is spec 0001's
    // third runner constraint and is deferred to feature 9 by name, because the
    // only Server Action in the repository today is one feature 7 deletes.
    const { error: writeError } = await aliceClient.from("profile").insert({
      id: alice.id,
      full_name: "Alice Fixture",
      summary: "Written by alice, and no one else may read this line.",
    });

    expect(writeError).toBeNull();

    // Alice can read back what she wrote. Without this the test below would
    // pass just as happily against a row that was never written at all.
    const { data: ownRow, error: ownError } = await aliceClient
      .from("profile")
      .select("id, full_name, summary")
      .maybeSingle();

    expect(ownError).toBeNull();
    expect(ownRow?.id).toBe(alice.id);
    expect(ownRow?.full_name).toBe("Alice Fixture");

    // Switch user. A separate jar is a separate browser.
    const bobSession = await mintSession(bob.email);
    const bobClient = await createClient(bobSession.jar);

    /**
     * NO `eq` FILTER, AND THAT IS THE POINT. The policy is what confines this
     * select. An application side filter would make the read look correct even
     * if the policy were broken, and silently remove the thing this proves.
     */
    const { data: bobSees, error: bobError } = await bobClient
      .from("profile")
      .select("id, full_name, summary");

    /**
     * Row level security returns NO ROWS rather than an error when a policy
     * does not match, so an empty result is the pass and an error would mean
     * something else went wrong.
     */
    expect(bobError).toBeNull();
    expect(bobSees).toEqual([]);

    // Asked for Alice's row by id explicitly, Bob still gets nothing. The
    // policy denies, rather than the absence of a filter hiding it.
    const { data: bobTargeted } = await bobClient
      .from("profile")
      .select("id")
      .eq("id", alice.id);

    expect(bobTargeted).toEqual([]);
  });

  it("refuses a write on behalf of another user", async () => {
    const carol = await freshUser("carol");
    const mallory = await freshUser("mallory");

    const session = await mintSession(mallory.email);
    const client = await createClient(session.jar);

    // The insert policy checks `auth.uid() = id`, so writing a row keyed to
    // somebody else is refused by the database rather than by application code.
    const { error } = await client.from("profile").insert({
      id: carol.id,
      full_name: "Written by mallory, on carol's behalf",
    });

    expect(error).not.toBeNull();
    // 42501 is Postgres `insufficient_privilege`, which is what a row level
    // security violation surfaces as.
    expect(error?.code).toBe("42501");
  });
});

describe("the fixed fixture pool", () => {
  /**
   * The read only half of the proof, against the seeded pool rather than
   * minted users (spec 0004, "Test isolation"). Two stable identities that each
   * see exactly one profile, and a different one. If both saw the same row, the
   * policy would not be doing its job and the seed would prove nothing.
   */
  it("shows each seeded user their own profile and no one else's", async () => {
    const oneSession = await mintSession("dev-one@example.test");
    const oneClient = await createClient(oneSession.jar);
    const { data: oneRows } = await oneClient
      .from("profile")
      .select("id, full_name");

    const twoSession = await mintSession("dev-two@example.test");
    const twoClient = await createClient(twoSession.jar);
    const { data: twoRows } = await twoClient
      .from("profile")
      .select("id, full_name");

    expect(oneRows).toHaveLength(1);
    expect(twoRows).toHaveLength(1);
    expect(oneRows?.[0]?.full_name).toBe("Dev One");
    expect(twoRows?.[0]?.full_name).toBe("Dev Two");
    expect(oneRows?.[0]?.id).not.toBe(twoRows?.[0]?.id);
  });

  /**
   * Spec 0003's AC-14 fixture: a signed in user who genuinely has no profile.
   * The application renders a visible expected failure for this user rather
   * than an empty page, and that path needs a real user with no row to exist.
   */
  it("leaves dev-three with no profile row to find", async () => {
    const session = await mintSession("dev-three@example.test");
    const client = await createClient(session.jar);

    const { data, error } = await client.from("profile").select("id");

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
