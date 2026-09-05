import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession } from "../helpers/session";

/**
 * The proxy does not hand the browser a refreshed cookie on a Server Action
 * request (spec 0014, AC-10 and AC-20).
 *
 * WHY THIS BUG NEEDED A TEST OF ITS OWN. AC-20 stopped `recordApplication`
 * writing a session cookie, on the reasoning that a cookie write during an
 * action makes Next re-render the current route, and that a re-render of
 * `/search` re-runs the Adzuna search and spends one of 25 weekly calls
 * (spec 0011). The reasoning was right and the location was wrong: `src/proxy.ts`
 * runs on the action POST too, refreshes there, and wrote the cookie the action
 * had been so carefully stopped from writing. `/check verify` measured it on
 * 2026-09-05: every `job_search` counter row moved by one per apply, twice out
 * of two, and only when the access token had expired.
 *
 * WHY IT IS AN INTEGRATION TEST. The whole bug is what a REAL refresh does. A
 * fake expired session never reaches GoTrue, so nothing would be refreshed and
 * nothing would be written, and the test would pass against the broken code.
 * That is the vacuous shape `docs/reflexes.md` records; this file mints a real
 * session, expires its access token, and lets the proxy genuinely refresh it.
 *
 * IT DOES NOT TOUCH THE `job_search` COUNTERS, so it is safe in `integration/`
 * rather than `integration-serial/`.
 */

const SESSION_COOKIE = /^sb-/;

let userId: string;
let expiredCookie: { name: string; value: string };

/** The minted session's cookie, rewritten so its access token reads as expired. */
function withExpiredAccessToken(cookie: { name: string; value: string }): {
  name: string;
  value: string;
} {
  const parsed = JSON.parse(
    Buffer.from(cookie.value.replace(/^base64-/, ""), "base64").toString(
      "utf8",
    ),
  ) as { expires_at: number; expires_in: number };

  parsed.expires_at = parsed.expires_at - 7200;
  parsed.expires_in = 0;

  return {
    name: cookie.name,
    value:
      "base64-" +
      Buffer.from(JSON.stringify(parsed), "utf8")
        .toString("base64")
        .replace(/=+$/, ""),
  };
}

/** A request carrying the expired session, optionally as an action dispatch. */
function requestWith(options: { readonly asServerAction: boolean }) {
  const request = new NextRequest(new URL("http://localhost:3000/search"), {
    method: options.asServerAction ? "POST" : "GET",
    headers: options.asServerAction
      ? { "next-action": "0123456789abcdef0123456789abcdef01234567" }
      : {},
  });

  request.cookies.set(expiredCookie.name, expiredCookie.value);

  return request;
}

beforeAll(async () => {
  const user = await mintFixtureUser("proxy-action-refresh");

  userId = user.id;

  const session = await mintSession(user.email);
  const cookie = (
    session.jar.getAll() as readonly { name: string; value: string }[]
  )[0];

  if (!cookie) throw new Error("the minted session put no cookie in the jar");

  expiredCookie = withExpiredAccessToken(cookie);
}, 60_000);

afterAll(async () => {
  await deleteFixtureUser(userId);
});

describe("an expired session on an ordinary request", () => {
  it("is refreshed and handed back to the browser, as it always was", async () => {
    const request = requestWith({ asServerAction: false });
    const response = await proxy(request);

    /**
     * The control. Without this the test below could pass because nothing
     * refreshes at all, which would say nothing about the action branch.
     */
    expect(
      response.cookies.getAll().filter((c) => SESSION_COOKIE.test(c.name)),
    ).not.toEqual([]);
  });
});

describe("an expired session on a Server Action request", () => {
  it("puts no session cookie on the response, so Next adds no re-render", async () => {
    const request = requestWith({ asServerAction: true });
    const response = await proxy(request);

    /**
     * THE ASSERTION THE BUG WOULD FAIL. A cookie here is what made Next
     * re-render `/search` into the action's response and spend an Adzuna call.
     */
    expect(
      response.cookies.getAll().filter((c) => SESSION_COOKIE.test(c.name)),
    ).toEqual([]);
  });

  it("still refreshes the session for this request's own code", async () => {
    const request = requestWith({ asServerAction: true });

    await proxy(request);

    /**
     * The other half, and the reason this is not simply "skip the refresh on
     * actions". `recordApplication` has to be able to verify its caller, so the
     * refreshed token must reach the forwarded request even though it never
     * reaches the browser.
     */
    const forwarded = request.cookies.get(expiredCookie.name);

    expect(forwarded).toBeDefined();
    expect(forwarded?.value).not.toBe(expiredCookie.value);
  });
});
