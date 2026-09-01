import { NextRequest } from "next/server";
import { afterAll, describe, expect, it } from "vitest";

import { RETURN_PATH_HEADER } from "@/lib/return-path";
import { proxy } from "@/proxy";

import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession } from "../helpers/session";

/**
 * Spec 0008, AC-10 and AC-10a: the pathname header survives a session refresh,
 * AND SO DOES THE REFRESHED SESSION COOKIE.
 *
 * WHY BOTH HALVES ARE ASSERTED IN ONE TEST, which AC-10a splits out for exactly
 * this reason. The headers handed to `NextResponse.next({ request: { headers } })`
 * are read once, at construction, and copied onto the response as internal
 * forwarding headers. They are a snapshot, not a live view. So a single
 * `Headers` object built at the top of the proxy and reused by reference inside
 * `setAll` would carry the pathname perfectly and lose the refreshed cookie: the
 * same request's Server Components would read a stale session while the browser
 * received a fresh one. A test asserting only the pathname passes while that
 * second bug ships.
 *
 * WHY THIS IS AN INTEGRATION TEST. `src/proxy.test.ts` says out loud that its
 * unit half works only because `getClaims()` returns early when there is no
 * session, so no refresh ever happens there and `setAll` is never called. This
 * needs a real session, a real expiry, and the real token endpoint. A mock whose
 * `setAll` merely rebuilt the response would encode the same assumption as the
 * code under test, which AGENTS.md forbids.
 */

const mintedUserIds: string[] = [];

afterAll(async () => {
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

/** The `base64-` prefix `@supabase/ssr` writes in front of a session cookie. */
const BASE64_PREFIX = "base64-";

/**
 * The same session cookie, with its stored expiry moved into the past.
 *
 * THE TOKEN ITSELF IS UNTOUCHED AND STILL REAL. `@supabase/ssr` stores the whole
 * session as base64url JSON, and the client decides whether to refresh by
 * reading `expires_at` out of that JSON rather than by verifying the token. So
 * moving the expiry back is how a test reaches the refresh path in a second
 * instead of an hour, and what follows is a genuine refresh: the real refresh
 * token goes to the real token endpoint and comes back with a new session.
 *
 * Written here rather than in a helper because it is a deliberate act of
 * tampering that belongs beside the one test that needs it.
 */
function expired(value: string): string {
  const encoded = value.slice(BASE64_PREFIX.length);
  const session: unknown = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  );

  if (typeof session !== "object" || session === null) {
    throw new Error(
      "The session cookie did not decode to an object, so this test cannot age it. Check whether @supabase/ssr changed its cookie encoding.",
    );
  }

  const aged = { ...session, expires_at: Math.floor(Date.now() / 1000) - 60 };

  return `${BASE64_PREFIX}${Buffer.from(JSON.stringify(aged), "utf8").toString("base64url")}`;
}

describe("the proxy keeps both the pathname and the refreshed session", () => {
  it("forwards the requested path and the new session cookie together", async () => {
    const user = await mintFixtureUser("proxy-refresh");
    mintedUserIds.push(user.id);

    const session = await mintSession(user.email);
    const stored = (await session.jar.getAll?.()) ?? [];
    const [cookie] = stored;

    if (cookie === undefined) {
      throw new Error(
        "The minted session wrote no cookie, so there is no session for the proxy to refresh.",
      );
    }

    const aged = expired(cookie.value);
    const request = new NextRequest(
      new URL("/search?q=react", "http://localhost:3000"),
    );
    request.cookies.set(cookie.name, aged);

    const response = await proxy(request);

    /**
     * THE REFRESH ACTUALLY HAPPENED. Without this the rest of the test would
     * pass on a request that never reached `setAll`, which is the same silent
     * pass the unit suite already has and the reason this file exists.
     */
    const refreshed = response.cookies.get(cookie.name);

    expect(refreshed).toBeDefined();
    expect(refreshed?.value).not.toBe(cookie.value);

    /** AC-10, first half: the pathname reached the forwarded request. */
    expect(
      response.headers.get(`x-middleware-request-${RETURN_PATH_HEADER}`),
    ).toBe("/search?q=react");

    /**
     * AC-10a, the half that a pathname only test would miss: the request handed
     * upstream carries the REFRESHED cookie, not the aged one this request
     * arrived with. If the headers were snapshotted before `setAll`'s cookie
     * loop, this would still hold the stale value.
     */
    const forwardedCookie = response.headers.get("x-middleware-request-cookie");

    expect(forwardedCookie).toContain(refreshed?.value);
    expect(forwardedCookie).not.toContain(aged);
  });
});
