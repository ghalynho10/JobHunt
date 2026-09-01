import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0008, AC-15, AC-15a, AC-16 and AC-14a: the callback route handler.
 *
 * WHAT IS NEW HERE, AND WHY IT NEEDS ITS OWN FILE. `callback.test.ts` covers
 * `completeSignIn()`, the exchange and its classification. This file covers the
 * handler wrapped around it, which spec 0008 gave three new jobs: consume the
 * return cookie, choose between the deep link and the landing rule, and clear
 * the cookie. None of that was tested; it was proved once in a browser.
 *
 * THE CRITERION THAT MATTERS MOST IS THE CLEAR, and it is the easiest to get
 * subtly wrong. AC-15 says the cookie is cleared on EVERY path through the
 * handler, including the ones where the value was refused and the ones where
 * the provider returned an error. A value left behind does not fail loudly. It
 * sits there and fires at some later, unrelated sign in, sending that person to
 * a page they never asked for. The clear must also repeat the exact `Path` the
 * cookie was written with, or it silently fails to match and the value survives
 * anyway, which looks identical to working.
 *
 * Only the Supabase client is replaced. `completeSignIn()`, `landingPathFor()`,
 * `parseReturnPathCookie()`, `signInErrorPath()` and `currentOrigin()` all run
 * for real.
 */

const CANONICAL = "https://usejobhunt.dev";
const USER_ID = "c4f13724-5b2a-41f4-8561-9a07d3f31f71";

/** The cookie name and path spec 0008 AC-5b fixes; asserted, not imported. */
const COOKIE = "jobhunt_return_path";
const COOKIE_PATH = "/auth/callback";

interface ExchangeResult {
  readonly data: { readonly user: { readonly id: string } | null };
  readonly error: { readonly status?: number; readonly message: string } | null;
}

let exchangeBehaviour: () => Promise<ExchangeResult>;
let profileBehaviour: () => Promise<{
  data: { id: string } | null;
  error: null;
}>;
let claimsCalls = 0;

const exchangesCleanly = (): Promise<ExchangeResult> =>
  Promise.resolve({ data: { user: { id: USER_ID } }, error: null });

beforeEach(() => {
  vi.resetModules();
  claimsCalls = 0;
  exchangeBehaviour = exchangesCleanly;
  // A profile row exists by default, so the landing rule answers `/search` and
  // a deep link test is not passing because both answers coincide.
  profileBehaviour = () =>
    Promise.resolve({ data: { id: USER_ID }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadRoute() {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", CANONICAL);
  vi.stubEnv("SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");

  vi.doMock("@/lib/supabase/server", () => ({
    createClient: () =>
      Promise.resolve({
        auth: {
          exchangeCodeForSession: () => exchangeBehaviour(),
          getClaims: () => {
            claimsCalls += 1;
            return Promise.resolve({ data: null, error: null });
          },
        },
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: () => profileBehaviour() }),
          }),
        }),
      }),
  }));

  return import("./route");
}

/** A callback arrival, with an optional return cookie already on the request. */
function arrival(query: string, cookie?: string): NextRequest {
  const request = new NextRequest(
    new URL(`/auth/callback?${query}`, "http://localhost:3000"),
  );

  if (cookie !== undefined) request.cookies.set(COOKIE, cookie);

  return request;
}

/** Where the handler sent the person, as path plus query. */
function destinationOf(response: Response): string {
  const location = response.headers.get("location");

  if (location === null) {
    throw new Error(
      "The callback answered without a location header. Every path through it must redirect.",
    );
  }

  const url = new URL(location);

  return `${url.pathname}${url.search}`;
}

/** The return cookie as it comes back to the browser, if at all. */
function returnCookieOn(response: {
  cookies: { get: (name: string) => unknown };
}) {
  return response.cookies.get(COOKIE) as
    { value: string; path?: string; maxAge?: number } | undefined;
}

describe("where a completed sign in lands (AC-16)", () => {
  it("honours the deep link the visitor followed", async () => {
    const { GET } = await loadRoute();

    const response = await GET(
      arrival("code=real", encodeURIComponent("/search?q=react")),
    );

    /**
     * The query string survives, which is what the percent encoding at every
     * boundary exists for. A path that arrived without `?q=react` would look
     * like a working deep link and drop the search the person asked for.
     */
    expect(destinationOf(response)).toBe("/search?q=react");
  });

  it("falls back to the landing rule when there is no deep link", async () => {
    const { GET } = await loadRoute();

    expect(destinationOf(await GET(arrival("code=real")))).toBe("/search");
  });

  it("sends a first time visitor to their profile", async () => {
    profileBehaviour = () => Promise.resolve({ data: null, error: null });

    const { GET } = await loadRoute();

    expect(destinationOf(await GET(arrival("code=real")))).toBe("/profile");
  });

  it("beats the profile gap rule with a valid deep link", async () => {
    profileBehaviour = () => Promise.resolve({ data: null, error: null });

    const { GET } = await loadRoute();

    /**
     * Both rules could fire here: no profile row says `/profile`, the deep link
     * says `/applications`. The deep link wins, because the visitor asked for
     * something specific and the gap rule is only a default.
     */
    expect(
      destinationOf(
        await GET(arrival("code=real", encodeURIComponent("/applications"))),
      ),
    ).toBe("/applications");
  });

  it("refuses a hostile cookie and uses the landing rule instead", async () => {
    const { GET } = await loadRoute();

    // The cookie is httpOnly, so this should be impossible, and it is parsed
    // anyway: this project parses at every boundary rather than trusting one.
    const response = await GET(
      arrival("code=real", encodeURIComponent("//evil.com")),
    );

    expect(destinationOf(response)).toBe("/search");
  });

  it("answers 303, so the browser gets the destination rather than repeating", async () => {
    const { GET } = await loadRoute();

    expect((await GET(arrival("code=real"))).status).toBe(303);
  });
});

describe("the return cookie is cleared on every path (AC-15)", () => {
  it.each([
    ["a completed sign in with a deep link", "code=real", "/applications"],
    ["a completed sign in with a refused value", "code=real", "//evil.com"],
    ["a provider error", "error=access_denied", "/applications"],
    ["an arrival with no code at all", "", "/applications"],
  ] as const)("clears it after %s", async (_case, query, cookieValue) => {
    const { GET } = await loadRoute();

    const response = await GET(arrival(query, encodeURIComponent(cookieValue)));
    const cleared = returnCookieOn(response);

    /**
     * EVERY path, including the two failing ones. A value that survives a failed
     * sign in fires at the next one, sending that person somewhere they never
     * asked to go, with nothing to explain it.
     */
    expect(cleared).toBeDefined();
    expect(cleared?.value).toBe("");
    expect(cleared?.maxAge).toBe(0);
  });

  it("clears it after a failed exchange too", async () => {
    exchangeBehaviour = () =>
      Promise.resolve({
        data: { user: null },
        error: { status: 400, message: "code verifier missing" },
      });

    const { GET } = await loadRoute();

    const response = await GET(
      arrival("code=stale", encodeURIComponent("/applications")),
    );

    expect(returnCookieOn(response)?.value).toBe("");
  });

  it("repeats the exact path the cookie was written with", async () => {
    const { GET } = await loadRoute();

    const response = await GET(
      arrival("code=real", encodeURIComponent("/applications")),
    );

    /**
     * A clear whose `Path` does not match the write does not match the cookie
     * either. Nothing throws, the response looks correct, and the value quietly
     * survives, which is indistinguishable from working until it fires.
     */
    expect(returnCookieOn(response)?.path).toBe(COOKIE_PATH);
  });
});

describe("a failed arrival keeps the deep link for the retry (AC-14a)", () => {
  it("carries the value onto the error redirect", async () => {
    const { GET } = await loadRoute();

    const response = await GET(
      arrival("error=access_denied", encodeURIComponent("/search?q=react")),
    );

    /**
     * The visitor followed a link, failed to sign in, and will try again from
     * `/sign-in`. Without this they lose the link that brought them here, and
     * the two error paths into that page behave differently by accident.
     */
    expect(destinationOf(response)).toBe(
      "/sign-in?error=access_denied&next=%2Fsearch%3Fq%3Dreact",
    );
  });

  it("still reaches the error page when there is nothing to carry", async () => {
    const { GET } = await loadRoute();

    expect(destinationOf(await GET(arrival("error=access_denied")))).toBe(
      "/sign-in?error=access_denied",
    );
  });

  it("does not carry a refused value onto the error redirect", async () => {
    const { GET } = await loadRoute();

    const response = await GET(
      arrival("error=access_denied", encodeURIComponent("//evil.com")),
    );

    // A refused value is not a destination anywhere, including on the way out.
    expect(destinationOf(response)).toBe("/sign-in?error=access_denied");
  });
});

describe("the session is read once per callback (AC-15a)", () => {
  it("runs the landing rule on the identity the exchange returned", async () => {
    const { GET } = await loadRoute();

    await GET(arrival("code=real"));

    /**
     * AC-15a. The handler must not re-read the session to find out who just
     * signed in: whether a client built later in the same request observes
     * cookies written earlier in it is the same snapshot question AC-10 exists
     * for, and taking the id from the exchange means nobody has to answer it.
     * A `getClaims()` call here would mean that question came back.
     */
    expect(claimsCalls).toBe(0);
  });
});
