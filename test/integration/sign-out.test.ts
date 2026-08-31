import { afterAll, describe, expect, it, vi } from "vitest";

import { createClient } from "@/lib/supabase/server";

import { createCookieJar, type CookieJar } from "../helpers/cookie-jar";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession } from "../helpers/session";

/**
 * Sign out (spec 0007, AC-11), against the real local stack.
 *
 * WHAT THIS IS ACTUALLY PROVING, since "it redirects" would be a weak claim. It
 * is that the session is genuinely gone afterwards: the cookies are cleared in
 * the jar the request would carry, and a client built from that jar can no
 * longer read the user it could read a moment earlier. A sign out that redirected
 * to `/` while leaving a live session behind would look identical in a browser
 * and be the exact silent failure this project's error model exists to prevent.
 *
 * `next/headers` IS THE ONE THING STUBBED, for the same reason and on the same
 * terms as `protected-route.test.ts`: the action calls `createClient()` with no
 * argument, by design, so it reads the real request's cookie store, and there is
 * no request in a test process. The stub supplies a cookie store and nothing
 * else. The session is real, minted through the real auth API, and every
 * decision about whether it is still valid stays with GoTrue.
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

/** Imported after the mock is declared, for readability only: `vi.mock` hoists. */
const { signOut } = await import("@/features/auth/actions");

const mintedUserIds: string[] = [];

afterAll(async () => {
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

async function signedIn() {
  const user = await mintFixtureUser("signout");
  mintedUserIds.push(user.id);
  return mintSession(user.email);
}

/**
 * Reads a Next.js redirect off the error it throws. Same arithmetic as
 * `protected-route.test.ts`, and read rather than imported for the same reason:
 * `isRedirectError` lives at an internal path with no compatibility promise.
 */
function redirectDestinationOf(thrown: unknown): string {
  if (
    typeof thrown !== "object" ||
    thrown === null ||
    !("digest" in thrown) ||
    typeof thrown.digest !== "string" ||
    !thrown.digest.startsWith("NEXT_REDIRECT;")
  ) {
    throw new Error(
      `Sign out threw something that is not a redirect: ${String(thrown)}. Failing is not the same as signing somebody out.`,
    );
  }

  return thrown.digest.split(";").slice(2, -2).join(";");
}

describe("signing out", () => {
  it("sends the person to the entry page (covers AC-11)", async () => {
    const session = await signedIn();
    requestScope.jar = session.jar;

    /**
     * `redirect()` works by throwing, which is exactly why AC-11 says this
     * action CONSTRUCTS a failure rather than returning one: no caller ever
     * regains control to read a returned value.
     */
    const thrown = await signOut().then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(redirectDestinationOf(thrown)).toBe("/");
  });

  /**
   * THE LOAD BEARING ONE. The redirect above is what a person sees; this is
   * whether anything actually happened.
   */
  it("leaves the jar with no session in it (covers AC-11)", async () => {
    const session = await signedIn();
    requestScope.jar = session.jar;

    const before = await createClient(session.jar);
    const { data: readable } = await before.auth.getClaims();
    expect(readable).not.toBeNull();

    await signOut().catch(() => undefined);

    const after = await createClient(session.jar);
    const { data, error } = await after.auth.getClaims();

    expect(data ?? null).toBeNull();
    expect(error ?? null).not.toBe(undefined);
  });

  /**
   * Signing out twice is not an error case worth surfacing to anybody: the
   * person ends up signed out and at `/` either way. Invariant 6 calls this best
   * effort but never silent, and the "never silent" half is `failure()`
   * reporting, not a different destination.
   */
  it("still redirects when there was no session to clear (covers AC-11)", async () => {
    requestScope.jar = createCookieJar();

    const thrown = await signOut().then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(redirectDestinationOf(thrown)).toBe("/");
  });
});
