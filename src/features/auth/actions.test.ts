import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { capturedEvents } from "../../../test/setup/sentry-transport";

/**
 * The sign in actions (spec 0007, AC-1, AC-4, AC-5, AC-6, AC-11).
 *
 * WHY THIS FILE EXISTS AT ALL. `/check verify` proved every behaviour below by
 * hand on 2026-08-31, reading the authorize URL the real action returned on
 * `https://usejobhunt.dev`. That proof was true once. These tests are the same
 * proof made permanent, so the next change to `actions.ts` has to keep it true.
 *
 * THE CASE THAT MATTERS MOST IS THE PREVIEW ONE. `canonicalSiteUrl` and
 * `currentOrigin()` are EQUAL IN PRODUCTION and differ everywhere else, so an
 * edit that swapped one for the other would pass every production check and
 * break sign in on every preview. AC-4 is written against exactly that trap and
 * the preview case below is the only one that can catch it.
 *
 * NOTHING THIS PROJECT OWNS IS MOCKED. `currentOrigin()` runs for real, driven
 * by `vi.stubEnv` and a genuine re-import, following `src/lib/origin.test.ts`:
 * stubbing the resolver would be a mock encoding the same assumption as the
 * code under test, and the assumption is the thing being checked. Only three
 * true boundaries are replaced: the Supabase auth SDK, Next's `redirect()`,
 * which works by throwing, and a thin wrapper around `Sentry.startSpan` that
 * records the span and then calls the real one.
 *
 * WHAT IS DELIBERATELY NOT HERE. That sign out actually clears the session is
 * proved against the real stack in `test/integration/sign-out.test.ts`, by
 * reading the jar back rather than by watching a redirect. Only the failing
 * path is added here, because making the real SDK fail is not something that
 * suite can do.
 */

/** The production origin, stubbed so these tests never read `.env.test`. */
const CANONICAL = "https://usejobhunt.dev";

/** A branch preview host, shaped like the ones Vercel actually issues. */
const BRANCH_HOST = "jobhunt-git-feat-auth-pgjules1996.vercel.app";

/**
 * What Supabase hands back: a real authorize URL carries the PKCE challenge and
 * the state, which is why the action redirects to it verbatim rather than
 * rebuilding it.
 */
const PROVIDER_URL =
  "https://project.supabase.co/auth/v1/authorize?provider=google&code_challenge=abc123&code_challenge_method=s256";

interface OAuthCall {
  readonly provider: string;
  readonly options: Readonly<Record<string, unknown>>;
}

interface ProviderError {
  readonly status?: number;
  readonly message: string;
}

/** Recorded per test, so an assertion can read what the SDK was actually asked. */
let oauthCalls: OAuthCall[] = [];
let openedSpans: { name: string; attributes?: Record<string, unknown> }[] = [];

/**
 * Cookies the action actually wrote, recorded rather than asserted through a
 * fake store, so a test can read back the exact attributes (spec 0008, AC-14).
 */
let writtenCookies: {
  name: string;
  value: string;
  options: Record<string, unknown>;
}[] = [];

/** Set per test to choose how the boundary behaves. */
let oauthBehaviour: () => Promise<{
  data: { url: string | null };
  error: ProviderError | null;
}>;
let signOutBehaviour: () => Promise<{ error: ProviderError | null }>;

/**
 * Next's `redirect()` works by throwing, and the actions depend on that: the
 * statement after a failing redirect is only unreachable because the throw
 * happens. A mock that returned normally would let both redirects run and read
 * `.value` off a failure, so this one throws exactly as the real one does.
 */
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect to ${url}`);
    this.name = "RedirectSignal";
  }
}

beforeEach(() => {
  vi.resetModules();
  oauthCalls = [];
  openedSpans = [];
  writtenCookies = [];
  oauthBehaviour = () =>
    Promise.resolve({ data: { url: PROVIDER_URL }, error: null });
  signOutBehaviour = () => Promise.resolve({ error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/**
 * Re-imports the actions against whatever the environment currently says.
 *
 * `vi.resetModules()` in `beforeEach` is what makes this a fresh parse rather
 * than the cached module `.env.test` already produced, so `src/env.ts`
 * re-validates and `origin.ts` reads a real `env` object.
 *
 * The two Sentry DSNs are supplied because spec 0002 AC-13 makes them required
 * the moment `NEXT_PUBLIC_VERCEL_ENV` is set. Without them the environment
 * contract refuses to parse and these tests would fail for a reason that has
 * nothing to do with sign in.
 */
async function loadActions() {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", CANONICAL);
  vi.stubEnv("SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");

  vi.doMock("@/lib/supabase/server", () => ({
    createClient: () =>
      Promise.resolve({
        auth: {
          signInWithOAuth: (call: OAuthCall) => {
            oauthCalls.push(call);
            return oauthBehaviour();
          },
          signOut: () => signOutBehaviour(),
        },
      }),
  }));

  vi.doMock("next/navigation", () => ({
    redirect: (url: string): never => {
      throw new RedirectSignal(url);
    },
  }));

  /**
   * A Server Action writes cookies through this store, and there is no request
   * in a test process, so `cookies()` would throw. The store is the framework's
   * boundary, not an assumption the action makes: every decision about whether
   * to write, what to write and with which attributes stays in `actions.ts` and
   * in the real validator.
   */
  vi.doMock("next/headers", () => ({
    cookies: () =>
      Promise.resolve({
        set: (
          name: string,
          value: string,
          options: Record<string, unknown>,
        ) => {
          writtenCookies.push({ name, value, options });
        },
      }),
  }));

  /**
   * The real `startSpan` still runs the callback, so this records the name and
   * attributes without changing behaviour. Binding rule 4 is about the span
   * existing at all, so a wrapper that swallowed it would prove nothing.
   */
  const actualSentry =
    await vi.importActual<typeof import("@sentry/nextjs")>("@sentry/nextjs");

  /**
   * A proxy rather than a spread. `@sentry/nextjs` re-exports most of its
   * surface, and spreading the namespace silently drops some of it, which shows
   * up far away as `result.ts` failing to find `getActiveSpan`. Falling through
   * to the real module for every other name means this wrapper can only ever
   * change the one function it names.
   */
  const recordingStartSpan = (
    options: { name: string; attributes?: Record<string, unknown> },
    callback: (...args: never[]) => unknown,
  ): unknown => {
    openedSpans.push({ name: options.name, attributes: options.attributes });
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

  return import("./actions");
}

/**
 * Runs an action and returns where it sent the person.
 *
 * An action that returns without redirecting is a failure of the action, not of
 * the test, so this says so rather than returning a value that reads like a
 * destination.
 */
async function redirectFrom(
  action: (formData: FormData) => Promise<void>,
  formData: FormData = new FormData(),
): Promise<string> {
  try {
    await action(formData);
  } catch (thrown) {
    if (thrown instanceof RedirectSignal) return thrown.url;
    throw thrown;
  }

  throw new Error(
    "The action returned without redirecting. Every path through it must end in a redirect.",
  );
}

/** A submitted provider form carrying a `next` field. */
function formWithNext(next: string): FormData {
  const formData = new FormData();
  formData.set("next", next);

  return formData;
}

/** The single `redirectTo` the SDK was asked for, read off the recorded call. */
function redirectToAskedFor(): string {
  const call = oauthCalls[0];

  if (call === undefined) {
    throw new Error("signInWithOAuth was never called.");
  }

  return (call.options as { redirectTo: string }).redirectTo;
}

describe("the origin the callback is sent back to (AC-4)", () => {
  it("uses localhost when nothing is deployed (covers AC-4)", async () => {
    const { signInWithGoogle } = await loadActions();

    await redirectFrom(signInWithGoogle);

    expect(redirectToAskedFor()).toBe("http://localhost:3000/auth/callback");
  });

  /**
   * THE CASE AC-4 EXISTS FOR. On a preview the two URL values diverge, so a
   * `redirectTo` built from `canonicalSiteUrl` would point at production, the
   * host only PKCE verifier written here would never be sent back, and sign in
   * would fail at the exchange. Production would still look perfect.
   */
  it("uses the branch URL on a preview, never the canonical site URL (covers AC-4)", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_BRANCH_URL", BRANCH_HOST);

    const { signInWithGoogle } = await loadActions();

    await redirectFrom(signInWithGoogle);

    expect(redirectToAskedFor()).toBe(`https://${BRANCH_HOST}/auth/callback`);
    expect(redirectToAskedFor()).not.toContain(CANONICAL);
  });

  it("uses the canonical origin in production (covers AC-4)", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");

    const { signInWithGitHub } = await loadActions();

    await redirectFrom(signInWithGitHub);

    expect(redirectToAskedFor()).toBe(`${CANONICAL}/auth/callback`);
  });

  /**
   * The URL comes from `data.url` and is never rebuilt, so the PKCE challenge
   * and the state Supabase put in it survive. Rebuilding it by hand would drop
   * them and every exchange would fail.
   */
  it("sends the person to the provider URL verbatim, PKCE intact (covers AC-4)", async () => {
    const { signInWithGoogle } = await loadActions();

    const destination = await redirectFrom(signInWithGoogle);

    expect(destination).toBe(PROVIDER_URL);
    expect(destination).toContain("code_challenge_method=s256");
  });
});

describe("what each provider is asked for (AC-1)", () => {
  /**
   * `user:email` is named to CONFIRM a default rather than to add a scope, and
   * it is load bearing either way: automatic linking (AC-8) fires only on a
   * verified email address, so a handshake returning without one would refuse a
   * signup that should have linked, and the symptom would look like a broken
   * hook rather than a missing scope.
   */
  it("names user:email on GitHub (covers AC-1)", async () => {
    const { signInWithGitHub } = await loadActions();

    await redirectFrom(signInWithGitHub);

    expect(oauthCalls[0]?.provider).toBe("github");
    expect(oauthCalls[0]?.options).toMatchObject({ scopes: "user:email" });
  });

  it("asks for no extra scopes on Google (covers AC-1)", async () => {
    const { signInWithGoogle } = await loadActions();

    await redirectFrom(signInWithGoogle);

    expect(oauthCalls[0]?.provider).toBe("google");
    expect(oauthCalls[0]?.options).not.toHaveProperty("scopes");
  });
});

describe("when the provider cannot be reached (AC-5, AC-6)", () => {
  it("sends the person to provider_unavailable when the SDK returns an error (covers AC-5)", async () => {
    oauthBehaviour = () =>
      Promise.resolve({
        data: { url: null },
        error: { status: 503, message: "upstream provider is down" },
      });

    const { signInWithGoogle } = await loadActions();

    expect(await redirectFrom(signInWithGoogle)).toBe(
      "/sign-in?error=provider_unavailable",
    );
  });

  /**
   * BINDING RULE 5: the provider SDK may throw rather than return, and
   * `attempt()` is what keeps that from escaping as an unhandled exception. A
   * throw here must land on the same sentence a returned error does, or a
   * provider outage would show a crash to one person and a sentence to another.
   */
  it("sends the person to provider_unavailable when the SDK throws (covers AC-5)", async () => {
    oauthBehaviour = () => Promise.reject(new Error("socket hang up"));

    const { signInWithGitHub } = await loadActions();

    expect(await redirectFrom(signInWithGitHub)).toBe(
      "/sign-in?error=provider_unavailable",
    );
  });

  /**
   * AC-5, invariant 4. The provider's own words reach Sentry and stop there.
   * The page renders this product's sentence, keyed by the code, so nothing the
   * provider wrote can be put on screen.
   */
  it("keeps the provider's own words off the redirect and sends them to Sentry (covers AC-5)", async () => {
    oauthBehaviour = () =>
      Promise.resolve({
        data: { url: null },
        error: { status: 503, message: "upstream provider is down" },
      });

    const { signInWithGoogle } = await loadActions();

    const destination = await redirectFrom(signInWithGoogle);

    expect(destination).not.toContain("upstream provider is down");
    expect(destination).not.toContain("503");

    const reported = capturedEvents();
    expect(reported).toHaveLength(1);
    expect(reported[0]?.tags).toMatchObject({
      "failure.kind": "external_service_failed",
    });
  });

  /**
   * AC-6. An unreachable provider is `unexpected`, so it reaches Sentry at
   * error level. A cancelled consent is `expected` and must not compete with it,
   * which is what keeps an ordinary denial from paging anybody.
   */
  it("reports an outage at error level rather than as an ordinary denial (covers AC-6)", async () => {
    oauthBehaviour = () =>
      Promise.resolve({
        data: { url: null },
        error: { status: 503, message: "upstream provider is down" },
      });

    const { signInWithGoogle } = await loadActions();

    await redirectFrom(signInWithGoogle);

    expect(capturedEvents()[0]?.level).toBe("error");
    expect(capturedEvents()[0]?.tags).toMatchObject({
      "failure.severity": "unexpected",
    });
  });
});

describe("binding rule 4: the named span opens first", () => {
  it("opens auth.sign_in carrying the provider as an attribute", async () => {
    const { signInWithGitHub } = await loadActions();

    await redirectFrom(signInWithGitHub);

    expect(openedSpans).toHaveLength(1);
    expect(openedSpans[0]?.name).toBe("auth.sign_in");
    expect(openedSpans[0]?.attributes).toMatchObject({ provider: "github" });
  });

  /**
   * THE WHOLE POINT OF THE RULE. A span opened only on the happy path would
   * leave a total provider outage producing no spans at all, so the failure
   * ratio would have no denominator and the alert would stay silent through
   * exactly the failure it exists to catch.
   */
  it("opens the span even when the handshake fails, so the ratio keeps a denominator", async () => {
    oauthBehaviour = () => Promise.reject(new Error("socket hang up"));

    const { signInWithGoogle } = await loadActions();

    await redirectFrom(signInWithGoogle);

    expect(openedSpans[0]?.name).toBe("auth.sign_in");
    expect(openedSpans[0]?.attributes).toMatchObject({ provider: "google" });
  });

  /**
   * One name for both providers, deliberately, as the span registry records:
   * the provider is an attribute, so every attempt groups under one name and
   * binding rule 4's ratio has a single denominator rather than two half sized
   * ones.
   */
  it("uses one span name for both providers, with the provider as the attribute", async () => {
    const first = await loadActions();
    await redirectFrom(first.signInWithGoogle);

    const googleSpan = openedSpans[0];

    vi.resetModules();
    openedSpans = [];
    oauthCalls = [];

    const second = await loadActions();
    await redirectFrom(second.signInWithGitHub);

    expect(googleSpan?.name).toBe(openedSpans[0]?.name);
    expect(googleSpan?.attributes).not.toEqual(openedSpans[0]?.attributes);
  });
});

describe("signing out when it does not go cleanly (AC-11)", () => {
  /**
   * BEST EFFORT BUT NEVER SILENT (invariant 6). Leaving somebody on a page that
   * looks signed in is worse than sending them home with a session the server
   * already gave up on, so the redirect happens either way.
   *
   * The clean path and the emptied cookie jar are proved against the real stack
   * in `test/integration/sign-out.test.ts`. Only the failing path is here,
   * because making the real SDK fail is not something that suite can do.
   */
  it("still sends the person home when the SDK reports an error (covers AC-11)", async () => {
    signOutBehaviour = () =>
      Promise.resolve({ error: { status: 500, message: "token revoked" } });

    const { signOut } = await loadActions();

    expect(await redirectFrom(signOut)).toBe("/");
  });

  it("reports the failed sign out rather than swallowing it (covers AC-11)", async () => {
    signOutBehaviour = () =>
      Promise.resolve({ error: { status: 500, message: "token revoked" } });

    const { signOut } = await loadActions();

    await redirectFrom(signOut);

    const reported = capturedEvents();
    expect(reported).toHaveLength(1);
    expect(reported[0]?.level).toBe("error");
    expect(reported[0]?.tags).toMatchObject({
      "failure.kind": "external_service_failed",
    });
  });

  it("still sends the person home when the SDK throws (covers AC-11)", async () => {
    signOutBehaviour = () => Promise.reject(new Error("socket hang up"));

    const { signOut } = await loadActions();

    expect(await redirectFrom(signOut)).toBe("/");
  });

  it("opens auth.sign_out as its first statement", async () => {
    const { signOut } = await loadActions();

    await redirectFrom(signOut);

    expect(openedSpans[0]?.name).toBe("auth.sign_out");
  });
});

describe("the deep link the visitor followed (spec 0008, AC-14, AC-14a)", () => {
  it("writes the return cookie before the provider call, with the attributes the spec fixes", async () => {
    const { signInWithGoogle } = await loadActions();

    await redirectFrom(signInWithGoogle, formWithNext("/search?q=react"));

    const [cookie] = writtenCookies;

    expect(cookie?.name).toBe("jobhunt_return_path");
    /** Percent encoded on write, decoded before validation on read. */
    expect(cookie?.value).toBe(encodeURIComponent("/search?q=react"));
    expect(cookie?.options).toMatchObject({
      httpOnly: true,
      /**
       * `Strict` is not sent on the cross site top level GET a provider returns
       * with, so it would silently disable the whole feature. This is the one
       * attribute whose wrong value looks harmless and breaks everything.
       */
      sameSite: "lax",
      path: "/auth/callback",
      maxAge: 600,
    });
  });

  it("leaves redirectTo carrying nothing but the origin and the callback", async () => {
    const { signInWithGoogle } = await loadActions();

    await redirectFrom(signInWithGoogle, formWithNext("/search?q=react"));

    /**
     * SPEC 0007, SAFEGUARD 3, still standing after this feature. The return path
     * travels in a cookie precisely so that no untrusted input ever reaches the
     * URL the provider is asked to send the person back to.
     */
    expect(redirectToAskedFor()).toBe("http://localhost:3000/auth/callback");
    expect(redirectToAskedFor()).not.toContain("search");
  });

  it("writes no cookie for a hostile value and signs in normally", async () => {
    const { signInWithGitHub } = await loadActions();

    /**
     * The value was already parsed at `/sign-in`, and it is parsed again here,
     * because a Server Action is a callable endpoint whatever page renders it.
     * Nothing guarantees this form came from the page that built it.
     */
    const destination = await redirectFrom(
      signInWithGitHub,
      formWithNext("//evil.com"),
    );

    expect(writtenCookies).toEqual([]);
    expect(destination).toBe(PROVIDER_URL);
  });

  it("writes no cookie when the form carries no return path", async () => {
    const { signInWithGoogle } = await loadActions();

    const destination = await redirectFrom(signInWithGoogle);

    expect(writtenCookies).toEqual([]);
    expect(destination).toBe(PROVIDER_URL);
  });

  it("carries the return path onto the error redirect so a retry keeps it", async () => {
    oauthBehaviour = () =>
      Promise.resolve({
        data: { url: null },
        error: { status: 503, message: "provider down" },
      });

    const { signInWithGoogle } = await loadActions();

    const destination = await redirectFrom(
      signInWithGoogle,
      formWithNext("/search?q=react"),
    );

    /**
     * AC-14a, the first of the two error paths. Without this a visitor who
     * followed a deep link, hit a provider outage and retried would lose the
     * link that brought them here, and the two error paths into `/sign-in` would
     * behave differently from each other by accident.
     */
    expect(destination).toBe(
      "/sign-in?error=provider_unavailable&next=%2Fsearch%3Fq%3Dreact",
    );
  });

  it("still reaches the error page when there is no return path to carry", async () => {
    oauthBehaviour = () =>
      Promise.resolve({
        data: { url: null },
        error: { status: 503, message: "provider down" },
      });

    const { signInWithGitHub } = await loadActions();

    const destination = await redirectFrom(signInWithGitHub);

    expect(destination).toBe("/sign-in?error=provider_unavailable");
  });
});
