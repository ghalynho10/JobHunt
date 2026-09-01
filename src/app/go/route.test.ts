import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { capturedEvents } from "../../../test/setup/sentry-transport";

/**
 * Spec 0008, AC-17, AC-17a, AC-6, AC-7a and AC-24: the door at `/go`.
 *
 * WHAT THE DOOR IS FOR. `/` is a static page that reads no session, which is the
 * whole value of spec 0006's contract, and a page that cannot tell who is
 * reading it was inviting everybody to sign in. This route reads the session on
 * `/`'s behalf so `/` can keep reading nothing and stop being wrong.
 *
 * WHY IT NEEDS ITS OWN TESTS. Until now this handler was proved only by a
 * browser walk on 2026-08-31. It carries a three way decision (signed in,
 * signed out, and a session read that ERRORED), and the third branch is the one
 * nobody thinks to check. It also carries two response headers that are a
 * security requirement rather than a performance note: a cached per visitor
 * redirect would send one person to another person's landing target.
 *
 * ONLY THE SUPABASE CLIENT IS REPLACED. `landingPathFor()`, `hasProfileRow()`,
 * `attempt()`, `failure()` and `currentOrigin()` all run for real, so this
 * exercises the actual decision chain rather than a parallel one. The Sentry
 * span wrapper records the name and then calls the real `startSpan`, following
 * `src/features/auth/actions.test.ts`.
 */

const CANONICAL = "https://usejobhunt.dev";

/** A real looking auth user id, so the profile read is asked a plausible thing. */
const USER_ID = "c4f13724-5b2a-41f4-8561-9a07d3f31f71";

interface ClaimsResult {
  readonly data: { readonly claims: { readonly sub: string } } | null;
  readonly error: { readonly message: string } | null;
}

interface ProfileResult {
  readonly data: { readonly id: string } | null;
  readonly error: { readonly code?: string; readonly message: string } | null;
}

let claimsBehaviour: () => Promise<ClaimsResult>;
let profileBehaviour: () => Promise<ProfileResult>;
let openedSpans: { name: string; op?: string }[] = [];
let profileQueriedFor: string[] = [];

/** Signed in, as the auth client reports it. */
const signedIn = (): Promise<ClaimsResult> =>
  Promise.resolve({ data: { claims: { sub: USER_ID } }, error: null });

/** Signed out: an answer, not a failure. */
const signedOut = (): Promise<ClaimsResult> =>
  Promise.resolve({ data: null, error: { message: "no session" } });

beforeEach(() => {
  vi.resetModules();
  openedSpans = [];
  profileQueriedFor = [];
  claimsBehaviour = signedOut;
  profileBehaviour = () => Promise.resolve({ data: null, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/**
 * Re-imports the route against the current environment and behaviours.
 *
 * The two Sentry DSNs are supplied because spec 0002 AC-13 makes them required
 * once `NEXT_PUBLIC_VERCEL_ENV` is set; without them the environment contract
 * refuses to parse and these tests would fail for a reason unrelated to the door.
 */
async function loadRoute() {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", CANONICAL);
  vi.stubEnv("SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");

  vi.doMock("@/lib/supabase/server", () => ({
    createClient: () =>
      Promise.resolve({
        auth: { getClaims: () => claimsBehaviour() },
        from: () => ({
          select: () => ({
            eq: (_column: string, value: string) => {
              profileQueriedFor.push(value);
              return { maybeSingle: () => profileBehaviour() };
            },
          }),
        }),
      }),
  }));

  const actualSentry =
    await vi.importActual<typeof import("@sentry/nextjs")>("@sentry/nextjs");

  /**
   * A proxy rather than a spread: spreading the Sentry namespace silently drops
   * exports and surfaces far away as `result.ts` losing `getActiveSpan`.
   */
  const recordingStartSpan = (
    options: { name: string; op?: string },
    callback: (...args: never[]) => unknown,
  ): unknown => {
    openedSpans.push({ name: options.name, op: options.op });
    return actualSentry.startSpan(
      options as Parameters<typeof actualSentry.startSpan>[0],
      callback as Parameters<typeof actualSentry.startSpan>[1],
    );
  };

  vi.doMock(
    "@sentry/nextjs",
    () =>
      new Proxy(actualSentry, {
        get: (target, property, receiver) =>
          property === "startSpan"
            ? recordingStartSpan
            : Reflect.get(target, property, receiver),
      }),
  );

  return import("./route");
}

/** Where the door sent this visitor, as a path. */
function pathOf(response: Response): string {
  const location = response.headers.get("location");

  if (location === null) {
    throw new Error(
      "The door answered without a location header, so it did not redirect at all.",
    );
  }

  return new URL(location).pathname;
}

describe("where the door sends a visitor (AC-17, AC-6)", () => {
  it("sends a signed out visitor to sign in", async () => {
    const { GET } = await loadRoute();

    expect(pathOf(await GET())).toBe("/sign-in");
  });

  it("sends a signed in visitor with no profile row to their profile", async () => {
    claimsBehaviour = signedIn;
    profileBehaviour = () => Promise.resolve({ data: null, error: null });

    const { GET } = await loadRoute();

    /**
     * The first time sign in, and the case the whole landing rule exists for:
     * the first thing this person sees asks for what the product needs.
     */
    expect(pathOf(await GET())).toBe("/profile");
  });

  it("sends a signed in visitor with a profile row to search", async () => {
    claimsBehaviour = signedIn;
    profileBehaviour = () =>
      Promise.resolve({ data: { id: USER_ID }, error: null });

    const { GET } = await loadRoute();

    // The other half. A door that sent everybody to /profile would pass the
    // case above while making the product unusable for everyone who returned.
    expect(pathOf(await GET())).toBe("/search");
  });

  it("asks about the caller's own row, not somebody else's", async () => {
    claimsBehaviour = signedIn;

    const { GET } = await loadRoute();
    await GET();

    // The id comes from claims the door already verified, never from input.
    expect(profileQueriedFor).toEqual([USER_ID]);
  });
});

describe("a session read that errored is a third state (AC-17a)", () => {
  it("sends the visitor to sign in rather than running the landing rule", async () => {
    claimsBehaviour = () => Promise.reject(new Error("JWKS unreachable"));

    const { GET } = await loadRoute();

    /**
     * THE ASYMMETRY THAT IS EASY TO GET BACKWARDS. Here an errored read is
     * treated like signed out, because running the landing rule for a caller
     * whose identity was never confirmed is the one outcome to avoid. The
     * `/sign-in` bounce makes the OPPOSITE choice for the same reason: both
     * routes fail toward showing the sign in surface, never toward assuming a
     * session. Its own test asserts that other half.
     */
    expect(pathOf(await GET())).toBe("/sign-in");
    expect(profileQueriedFor).toEqual([]);
  });

  it("reports the failure rather than swallowing it", async () => {
    claimsBehaviour = () => Promise.reject(new Error("JWKS unreachable"));

    const { GET } = await loadRoute();
    await GET();

    // Binding rule 5: a throw at an external boundary becomes a reported
    // failure, never a silent fallback that reads like an ordinary signed out.
    expect(capturedEvents()).toHaveLength(1);
    expect(capturedEvents()[0]?.tags?.["failure.kind"]).toBe(
      "external_service_failed",
    );
  });

  it("sends a visitor to search when the profile read errors, never to profile", async () => {
    claimsBehaviour = signedIn;
    profileBehaviour = () =>
      Promise.resolve({
        data: null,
        error: { code: "57P01", message: "server closed the connection" },
      });

    const { GET } = await loadRoute();

    /**
     * AC-7a, AND THE DISTINCTION IS THE WHOLE POINT. An absent row and a failed
     * read both produce "no row", and collapsing them would land this visitor on
     * `/profile` during a database outage as though their profile were merely
     * empty. `/search` assumes nothing about their data. Note the contrast with
     * the second test in the block above, where the SAME absent row means
     * `/profile` because the read succeeded.
     */
    expect(pathOf(await GET())).toBe("/search");
    expect(capturedEvents()).toHaveLength(1);
    expect(capturedEvents()[0]?.tags?.["failure.kind"]).toBe(
      "database_unavailable",
    );
  });
});

describe("the response the door sends (AC-17)", () => {
  it("carries no-store, because the destination differs per visitor", async () => {
    const { GET } = await loadRoute();
    const response = await GET();

    /**
     * A SECURITY REQUIREMENT, NOT A PERFORMANCE NOTE. Without this a cache could
     * serve one visitor's redirect to another, sending a signed out stranger
     * straight to a signed in person's landing target.
     */
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("asks not to be indexed", async () => {
    const { GET } = await loadRoute();

    expect((await GET()).headers.get("x-robots-tag")).toBe("noindex");
  });

  it("redirects with 307 and writes no cookie", async () => {
    claimsBehaviour = signedIn;

    const { GET } = await loadRoute();
    const response = await GET();

    expect(response.status).toBe(307);
    // The door decides a destination. It has no business minting state.
    expect(response.cookies.getAll()).toEqual([]);
  });
});

describe("binding rule 4 at the door (AC-24)", () => {
  it("opens door.decide on every path, including the ones that return early", async () => {
    // covers: AC-24
    const { GET } = await loadRoute();
    await GET();

    /**
     * THE ORDERING THE RULE IS ABOUT. A signed out visitor is the earliest
     * return in the handler, so a span opened after that guard would leave a
     * total sign in outage producing no spans at all: the failure ratio would
     * have no denominator and the alert would stay silent through exactly the
     * outage it exists to catch.
     */
    expect(openedSpans).toEqual([{ name: "door.decide", op: "function" }]);
  });

  it("still opens it when the session read throws", async () => {
    claimsBehaviour = () => Promise.reject(new Error("JWKS unreachable"));

    const { GET } = await loadRoute();
    await GET();

    expect(openedSpans.map((span) => span.name)).toContain("door.decide");
  });

  it("opens landing_rule.decide inside it when the caller is signed in", async () => {
    claimsBehaviour = signedIn;

    const { GET } = await loadRoute();
    await GET();

    // Two named operations, both registered in docs/observability/spans.md.
    expect(openedSpans.map((span) => span.name)).toEqual([
      "door.decide",
      "landing_rule.decide",
    ]);
  });
});
