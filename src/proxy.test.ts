import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { config, proxy } from "./proxy";

/**
 * Spec 0001, BINDING RULE 6: authorisation is never decided in the proxy.
 *
 * This is the durable half of feature 1's DW-4 ("the framework, client, session,
 * policy and error path all connect"), locked here rather than in
 * `verify.md`'s manual steps, which drove a `scaffold_check` table feature 4 has
 * since dropped and a password sign in feature 7 deletes. The rule itself
 * outlives both.
 *
 * WHY THIS IS A UNIT TEST AND NEEDS NO STACK. Every case below is the absence
 * of a session, and `getClaims()` returns without a network call when there is
 * no session to verify (`@supabase/auth-js` 2.112.3, `getClaims` returns early
 * on `getSession()` finding nothing). So binding rule 6 is checked on every
 * `pnpm test`, in CI, before Docker has even started. The signed in half of the
 * same rule needs a real session and lives in
 * `test/integration/protected-route.test.ts`.
 *
 * The rule is worth guarding because breaking it is an easy, tempting edit: a
 * redirect here would look like it worked, and would move the real
 * authorisation decision off the database and into a file that must never make
 * one.
 */

/** A request as the proxy actually receives one, with no session attached. */
function anonymousRequestFor(path: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

describe("binding rule 6: the proxy decides no authorisation", () => {
  it("hands an unauthenticated request onward instead of redirecting it", async () => {
    const response = await proxy(anonymousRequestFor("/health"));

    /**
     * `/health` is behind the protected layout, and this request carries no
     * session at all. A proxy that decided anything would answer 307 with a
     * `location`. Passing it on is the whole rule: the layout redirects, every
     * Server Action checks its own caller, and row level security is the real
     * guarantee behind both.
     */
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("treats a protected route exactly as it treats a public one", async () => {
    const protectedResponse = await proxy(anonymousRequestFor("/health"));
    const publicResponse = await proxy(anonymousRequestFor("/"));

    /**
     * The strongest statement of the rule available without a session: the
     * proxy cannot be deciding who may see what if it cannot tell these two
     * apart. A per route rule added here would show up as a difference.
     */
    expect(protectedResponse.status).toBe(publicResponse.status);
    expect(protectedResponse.headers.get("location")).toBe(
      publicResponse.headers.get("location"),
    );
  });

  it("writes no session cookie when there is no session to refresh", async () => {
    const response = await proxy(anonymousRequestFor("/health"));

    // Nothing was refreshed, so nothing should be handed back to the browser.
    // A cookie here would mean the proxy invented a session state of its own.
    expect(response.cookies.getAll()).toEqual([]);
  });
});

describe("the matcher decides where the session is refreshed", () => {
  /**
   * Reads `config.matcher` as a regular expression, anchored the way Next.js
   * anchors a matcher.
   *
   * WHAT THIS PROVES AND WHAT IT DOES NOT. Next.js compiles a matcher with
   * path-to-regexp rather than `new RegExp`, so this is a close reading of the
   * pattern's own intent, not the router itself. It is here because the
   * realistic regression is an edit to the exclusion list (a dropped file
   * extension, a new route accidentally excluded), and that this catches. A
   * difference between path-to-regexp and `RegExp` on a pattern with no `:param`
   * segments is not the failure mode worth guarding against.
   */
  function matcherPattern(): RegExp {
    const [pattern] = config.matcher;

    if (pattern === undefined) {
      throw new Error(
        "src/proxy.ts exports an empty matcher, so no request is proxied and no session is ever refreshed.",
      );
    }

    return new RegExp(`^${pattern}$`);
  }

  it("covers every route that carries a session", () => {
    const matcher = matcherPattern();

    // The three real routes as of `next typegen` (.next/types/routes.d.ts).
    // Each is rendered for a signed in user, so each needs the refresh.
    expect(matcher.test("/")).toBe(true);
    expect(matcher.test("/health")).toBe(true);
    expect(matcher.test("/sign-in")).toBe(true);
  });

  it("skips static assets and image files, which carry no session", () => {
    const matcher = matcherPattern();

    // Refreshing on these is wasted work on every page load, which is the
    // reason the exclusion list exists at all.
    expect(matcher.test("/_next/static/chunks/main.js")).toBe(false);
    expect(matcher.test("/_next/image")).toBe(false);
    expect(matcher.test("/favicon.ico")).toBe(false);

    // One per extension the list names, so dropping any single one fails here
    // rather than quietly costing a refresh per asset.
    expect(matcher.test("/icon.svg")).toBe(false);
    expect(matcher.test("/logo.png")).toBe(false);
    expect(matcher.test("/photo.jpg")).toBe(false);
    expect(matcher.test("/photo.jpeg")).toBe(false);
    expect(matcher.test("/spinner.gif")).toBe(false);
    expect(matcher.test("/hero.webp")).toBe(false);
    expect(matcher.test("/hero.avif")).toBe(false);
    expect(matcher.test("/apple-touch.ico")).toBe(false);
  });
});
