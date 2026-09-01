import { afterAll, describe, expect, it, vi } from "vitest";

import { capturedEvents } from "../setup/sentry-transport";

import type { CookieJar } from "../helpers/cookie-jar";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession } from "../helpers/session";

/**
 * Spec 0008, AC-6, AC-7 and AC-7a: the landing rule, against real sessions and
 * the real policy.
 *
 * WHY THIS CANNOT BE A UNIT TEST. The rule's whole answer is "does this person
 * have a profile row", and the thing that decides it is row level security in
 * Postgres, not the code. A unit test with a fake client would assert that the
 * code returns what the fake said, which is the mock encoding the same
 * assumption as the code under test that AGENTS.md forbids.
 *
 * THE CRITERION THIS FILE EXISTS FOR IS AC-7, AND IT IS EASY TO GET WRONG IN A
 * WAY NOTHING ELSE CATCHES. A first time sign in has no profile row by
 * definition, so if this read reported that as a failure the way
 * `readOwnProfile()` deliberately does, then the single most ordinary event in
 * the product would land in the failure ratio feature 9 alerts on, and the alert
 * would fire hardest on the days sign ups went best. Counting the reported
 * events is how that is checked rather than assumed.
 *
 * `next/headers` is the one thing stubbed, and only to supply a cookie store:
 * `createClient()` reads the real request's cookies by design and `cookies()`
 * throws outside a request scope. Same boundary and same reasoning as
 * `test/integration/profile-read.test.ts`.
 */

const requestScope = vi.hoisted(() => ({
  jar: undefined as CookieJar | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      getAll: () => requestScope.jar?.getAll() ?? [],
      set: (name: string, value: string, options: Record<string, unknown>) => {
        requestScope.jar?.setAll?.([{ name, value, options }], {});
      },
    }),
}));

const { landingPathFor } = await import("@/lib/landing-rule");
const { hasProfileRow, readOwnProfile } =
  await import("@/features/profile/queries");
const { createClient } = await import("@/lib/supabase/server");

const mintedUserIds: string[] = [];

/** A real signed in user, with the session installed as the request's cookies. */
async function signedInAs(prefix: string) {
  const user = await mintFixtureUser(prefix);
  mintedUserIds.push(user.id);

  const session = await mintSession(user.email);
  requestScope.jar = session.jar;

  return { ...user, jar: session.jar };
}

afterAll(async () => {
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

describe("where a signed in visitor lands (AC-6)", () => {
  it("sends a user with no profile row to /profile", async () => {
    const user = await signedInAs("landing-new");

    /**
     * The first time sign in, which is the case the whole rule exists for: the
     * first thing this person sees asks for what the product needs from them.
     */
    expect(await landingPathFor(user.id)).toBe("/profile");
  });

  it("sends a user with a profile row to /search", async () => {
    const user = await signedInAs("landing-returning");
    const client = await createClient(user.jar);

    const { error } = await client
      .from("profile")
      .insert({ id: user.id, full_name: "Returning Fixture" });

    expect(error).toBeNull();

    /**
     * THE OTHER HALF, AND A REDIRECT ONLY TEST WOULD MISS IT: a rule that sent
     * everybody to `/profile` would pass the case above while making the product
     * unusable for everyone who already filled it in.
     */
    expect(await landingPathFor(user.id)).toBe("/search");
  });
});

describe("an absent row is an answer, not a failure (AC-7)", () => {
  it("reports nothing to Sentry when there is no profile yet", async () => {
    const user = await signedInAs("landing-quiet");

    expect(await hasProfileRow(user.id)).toEqual({ ok: true, value: false });

    /**
     * THE CRITERION, MEASURED RATHER THAN ASSERTED IN PROSE. `readOwnProfile()`
     * builds a `record_not_found` here, which reports and marks its span failed.
     * Reusing it would have put every first sign in into the failure ratio.
     * Zero events is what says this read does not.
     */
    expect(capturedEvents()).toHaveLength(0);

    /**
     * AND THE ZERO ABOVE IS NOT VACUOUS. The same user, the same absent row,
     * read through `readOwnProfile()` instead, DOES report. So the recorder is
     * working and the difference between the two reads is real, rather than this
     * test passing because nothing was ever going to be captured.
     */
    await readOwnProfile();

    expect(capturedEvents()).toHaveLength(1);
    expect(capturedEvents()[0]?.tags?.["failure.kind"]).toBe(
      "record_not_found",
    );
  });

  it("still answers true through the policy rather than through a filter", async () => {
    const user = await signedInAs("landing-policy");
    const client = await createClient(user.jar);

    await client
      .from("profile")
      .insert({ id: user.id, full_name: "Policy Fixture" });

    expect(await hasProfileRow(user.id)).toEqual({ ok: true, value: true });

    /**
     * ANOTHER USER'S ID RETURNS `false`, NOT THEIR ROW. The filter names the
     * row, and the policy is what confines the read to this caller, so asking
     * for somebody else's id finds nothing even though that row exists.
     */
    const other = await mintFixtureUser("landing-other");
    mintedUserIds.push(other.id);

    const otherSession = await mintSession(other.email);
    const otherClient = await createClient(otherSession.jar);

    await otherClient
      .from("profile")
      .insert({ id: other.id, full_name: "Other Fixture" });

    // Still reading as the first user, whose session is in the request scope.
    expect(await hasProfileRow(other.id)).toEqual({ ok: true, value: false });
  });
});
