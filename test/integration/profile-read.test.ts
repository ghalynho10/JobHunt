import { afterAll, describe, expect, it, vi } from "vitest";

import { isFailure } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

import { createCookieJar, type CookieJar } from "../helpers/cookie-jar";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession } from "../helpers/session";

/**
 * Spec 0003, AC-14 and AC-15: `readOwnProfile()` against the real local stack.
 *
 * This is the read every Slice 1 feature builds on, and the deployed end to end
 * proof that six things connect at once. `verify.sql` already proves the schema,
 * the policies and the constraints (83 checks), and feature 8's
 * `isolation.test.ts` proves row level security on `profile` at the raw query
 * level. NONE OF THEM TOUCH THIS FUNCTION. What is locked here is the code
 * feature 4 actually ships: its failure kinds, its parse, and the fact that it
 * inherits isolation rather than implementing it.
 *
 * WHY `next/headers` IS STUBBED, and only that. `readOwnProfile()` calls
 * `createClient()` with no argument by design, so it reads the real request's
 * cookie store, and `cookies()` throws outside a request scope. The stub
 * supplies a cookie store and nothing else: the sessions are real, the policies
 * are real, and the rows are real. Same boundary, same reasoning as
 * `test/integration/protected-route.test.ts`.
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

const { readOwnProfile } = await import("@/features/profile/queries");

const mintedUserIds: string[] = [];

/**
 * A signed in user of their own, with the session installed as the request's
 * cookies so `readOwnProfile()` reads as them.
 *
 * Fresh users rather than the fixed pool, per spec 0004: the pool serves the
 * read only isolation proof, and everything that writes takes its own user.
 * These tests write profiles, and two of them minting `dev-one` at once would
 * race on the magiclink anyway.
 */
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

/** Inserts a profile through the caller's own client, under the real policy. */
async function insertProfile(
  client: Awaited<ReturnType<typeof createClient>>,
  id: string,
  fullName: string,
): Promise<void> {
  const { error } = await client
    .from("profile")
    .insert({ id, full_name: fullName });

  expect(error).toBeNull();
}

describe("readOwnProfile() returns the caller's own profile (AC-14)", () => {
  it("returns the row the caller wrote", async () => {
    const user = await signedInAs("profile-owner");
    const client = await createClient(user.jar);

    await client.from("profile").insert({
      id: user.id,
      full_name: "Owner Fixture",
      location: "Lisbon",
      summary: "Written by the owner.",
    });

    const result = await readOwnProfile();

    if (isFailure(result)) {
      throw new Error(
        `Expected the caller's own profile, got ${result.kind}: ${result.message}`,
      );
    }

    expect(result.value.id).toBe(user.id);
    expect(result.value.full_name).toBe("Owner Fixture");
    expect(result.value.location).toBe("Lisbon");
    expect(result.value.summary).toBe("Written by the owner.");
  });

  it("maps an absent optional column to undefined, not null (AC-15)", async () => {
    const user = await signedInAs("profile-sparse");
    const client = await createClient(user.jar);

    // `location` and `summary` are nullable columns, left unset here, so the
    // database genuinely returns null for both.
    await client.from("profile").insert({
      id: user.id,
      full_name: "Sparse Fixture",
    });

    const result = await readOwnProfile();

    if (isFailure(result)) {
      throw new Error(
        `Expected a profile with no location or summary, got ${result.kind}: ${result.message}`,
      );
    }

    /**
     * THIS IS THE OBSERVABLE PROOF THAT A REAL PARSE RAN, which is what AC-15
     * asks for ("parsed rather than type asserted"). The database returned
     * null. A type assertion would have handed that null straight through and
     * these would read null. They read undefined only because the schema's
     * `.transform()` actually executed, so this fails the moment the parse is
     * swapped for a cast.
     *
     * It also holds the project rule that prefers `undefined` in a union, so
     * nothing downstream has to handle two kinds of absent.
     */
    expect(result.value.location).toBeUndefined();
    expect(result.value.summary).toBeUndefined();
    expect(result.value.location).not.toBeNull();
  });

  it("shows one user nothing of another user's profile", async () => {
    const first = await signedInAs("profile-first");
    const firstClient = await createClient(first.jar);

    await insertProfile(firstClient, first.id, "First Fixture");

    // Switch user. A separate jar is a separate browser.
    const second = await signedInAs("profile-second");
    const secondClient = await createClient(second.jar);

    await insertProfile(secondClient, second.id, "Second Fixture");

    const result = await readOwnProfile();

    if (isFailure(result)) {
      throw new Error(
        `Expected the second user's own profile, got ${result.kind}: ${result.message}`,
      );
    }

    /**
     * `readOwnProfile()` carries NO `eq` FILTER ON THE CALLER'S ID, deliberately:
     * the policy is what confines the select, and an application side filter
     * would make the read look correct even if the policy were broken. That
     * design is only safe if it actually holds, which is what this checks at
     * the level a caller uses, rather than at the raw query level
     * `isolation.test.ts` already covers.
     */
    expect(result.value.id).toBe(second.id);
    expect(result.value.full_name).toBe("Second Fixture");
  });
});

describe("a failure is named, never an empty read", () => {
  it("reports record_not_found for a signed in user with no profile yet (AC-14)", async () => {
    await signedInAs("profile-absent");

    const result = await readOwnProfile();

    if (!isFailure(result)) {
      throw new Error(
        "A user with no profile row got a successful read, so something is inventing a profile.",
      );
    }

    /**
     * EXPECTED, NOT BROKEN. Row level security returns no rows rather than an
     * error when a policy does not match, and a signed in user with no profile
     * is an ordinary state until feature 9 builds the form that creates one.
     * Saying so out loud is the point: an empty render is indistinguishable
     * from success with nothing to show.
     */
    expect(result.kind).toBe("record_not_found");
    expect(result.severity).toBe("expected");
  });

  it("reports session_missing when no session is present at all", async () => {
    requestScope.jar = createCookieJar();

    const result = await readOwnProfile();

    if (!isFailure(result)) {
      throw new Error(
        "An unauthenticated read succeeded, which would mean the row was reachable with no session.",
      );
    }

    /**
     * NOT AN UNREACHABLE PATH. The protected layout's redirect only changes the
     * response it sends; the page still renders concurrently underneath it, so
     * an unauthenticated request genuinely reaches this call. Naming it
     * `session_missing` rather than letting it fall through as
     * `database_unavailable` is what stops a signed out visit looking like an
     * outage.
     */
    expect(result.kind).toBe("session_missing");
    expect(result.severity).toBe("expected");
  });
});
