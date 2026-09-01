import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { flatten, renderDeep } from "../../../../test/helpers/react-element";

/**
 * Spec 0008, AC-20, AC-17a, AC-13 and AC-24: the `/sign-in` bounce.
 *
 * WHY THE PAGE READS THE SESSION AT ALL. Showing provider buttons to somebody
 * who is already signed in is the same dishonesty on `/sign-in` that AC-18
 * removes from `/`. Spec 0007's security model said this page read nothing;
 * spec 0008 supersedes that line deliberately, and `/` is unchanged.
 *
 * WHY THIS FILE EXISTS. The bounce is four branches deep and until now was
 * proved only by a browser walk on 2026-08-31. Three of its branches are
 * exceptions to the obvious rule, and every one of them is the kind a later
 * refactor removes as dead code:
 *
 *   1. an `error` parameter suppresses the bounce, or the person never reads
 *      why their sign in failed
 *   2. a valid `next` beats the landing rule, so the bounce that exists to help
 *      does not throw away the link that brought them here
 *   3. a session read that ERRORED must NOT bounce, which is the opposite of
 *      what the door at `/go` does with the same third state
 *
 * The third is the one worth guarding hardest. Treating an errored read as
 * signed in would throw a genuinely signed out visitor off the only page that
 * lets them sign in, so nobody could authenticate until the error cleared.
 *
 * Only three true boundaries are replaced: the Supabase client, Next's
 * `redirect()`, which works by throwing, and a recording wrapper around
 * `Sentry.startSpan` that calls the real one. `parseReturnPath()` and
 * `landingPathFor()` run for real.
 */

const CANONICAL = "https://usejobhunt.dev";
const USER_ID = "c4f13724-5b2a-41f4-8561-9a07d3f31f71";

interface ClaimsResult {
  readonly data: { readonly claims: { readonly sub: string } } | null;
  readonly error: { readonly message: string } | null;
}

let claimsBehaviour: () => Promise<ClaimsResult>;
let profileBehaviour: () => Promise<{
  data: { id: string } | null;
  error: null;
}>;
let openedSpans: string[] = [];

const signedIn = (): Promise<ClaimsResult> =>
  Promise.resolve({ data: { claims: { sub: USER_ID } }, error: null });

const signedOut = (): Promise<ClaimsResult> =>
  Promise.resolve({ data: null, error: { message: "no session" } });

/**
 * Next's `redirect()` works by throwing, and the page depends on that: the
 * render after a bounce is only unreachable because the throw happens.
 */
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect to ${url}`);
    this.name = "RedirectSignal";
  }
}

beforeEach(() => {
  vi.resetModules();
  openedSpans = [];
  claimsBehaviour = signedOut;
  // A profile row exists by default, so the landing rule answers /search and a
  // test that means to exercise the deep link is not accidentally passing
  // because both answers happen to be the same route.
  profileBehaviour = () =>
    Promise.resolve({ data: { id: USER_ID }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadPage() {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", CANONICAL);
  vi.stubEnv("SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");

  vi.doMock("@/lib/supabase/server", () => ({
    createClient: () =>
      Promise.resolve({
        auth: { getClaims: () => claimsBehaviour() },
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: () => profileBehaviour() }),
          }),
        }),
      }),
  }));

  vi.doMock("next/navigation", () => ({
    redirect: (url: string): never => {
      throw new RedirectSignal(url);
    },
  }));

  const actualSentry =
    await vi.importActual<typeof import("@sentry/nextjs")>("@sentry/nextjs");

  const recordingStartSpan = (
    options: { name: string },
    callback: (...args: never[]) => unknown,
  ): unknown => {
    openedSpans.push(options.name);
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

  return import("./page");
}

type Query = Record<string, string | string[] | undefined>;

/**
 * Renders the page, expecting it NOT to bounce.
 *
 * A page that bounced when it should have rendered is the failure this helper
 * names out loud, because the symptom otherwise is a person who cannot reach
 * the only screen that signs them in.
 */
async function renderWith(query: Query) {
  const { default: SignInPage } = await loadPage();

  try {
    return await SignInPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(query),
    } as never);
  } catch (thrown) {
    if (thrown instanceof RedirectSignal) {
      throw new Error(
        `The page bounced to ${thrown.url} when it should have rendered the sign in form.`,
      );
    }
    throw thrown;
  }
}

/** Runs the page, expecting a bounce, and returns where it sent them. */
async function bounceFrom(query: Query): Promise<string> {
  const { default: SignInPage } = await loadPage();

  try {
    await SignInPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(query),
    } as never);
  } catch (thrown) {
    if (thrown instanceof RedirectSignal) return thrown.url;
    throw thrown;
  }

  throw new Error(
    "The page rendered the provider buttons for a visitor who is already signed in.",
  );
}

describe("a signed in visitor is sent onward (AC-20)", () => {
  it("bounces to the landing rule when there is nothing else to honour", async () => {
    claimsBehaviour = signedIn;

    expect(await bounceFrom({})).toBe("/search");
  });

  it("bounces to the profile of a visitor who has no profile row", async () => {
    claimsBehaviour = signedIn;
    profileBehaviour = () => Promise.resolve({ data: null, error: null });

    expect(await bounceFrom({})).toBe("/profile");
  });

  it("honours a valid deep link instead of the landing rule", async () => {
    claimsBehaviour = signedIn;

    /**
     * The landing rule would answer `/search` here, so the two destinations
     * differ and this really does prove the deep link won rather than agreeing
     * with the rule by luck.
     */
    expect(await bounceFrom({ next: "/applications" })).toBe("/applications");
  });

  it("falls back to the landing rule when the deep link is hostile", async () => {
    claimsBehaviour = signedIn;

    // Anyone can send a victim /sign-in?next=<anything>, so the value is parsed
    // at this boundary and a refused one is simply not a destination.
    expect(await bounceFrom({ next: "//evil.com" })).toBe("/search");
  });
});

describe("the exceptions that keep the page reachable (AC-20, AC-17a)", () => {
  it("does not bounce when there is an error to show", async () => {
    claimsBehaviour = signedIn;

    /**
     * `signInErrorPath()` sends a failed callback here. Bouncing would discard
     * the sentence the person needs to read and leave them back where they
     * started with no idea why, which is the silent failure the error model
     * exists to prevent.
     */
    const page = await renderWith({ error: "account_exists" });

    expect(page).toBeDefined();
  });

  it("does not bounce when the session read errored", async () => {
    claimsBehaviour = () => Promise.reject(new Error("JWKS unreachable"));

    /**
     * THE ASYMMETRY WITH `/go`, ASSERTED FROM THIS SIDE. The door treats an
     * errored read as signed out and sends the visitor here. This page must NOT
     * treat it as signed in, or a genuinely signed out visitor is thrown off the
     * only page that lets them authenticate, and nobody can sign in until the
     * error clears. Both routes fail toward showing the sign in surface.
     */
    const page = await renderWith({});

    expect(page).toBeDefined();
  });

  it("renders normally for an ordinary signed out visitor", async () => {
    const page = await renderWith({});

    expect(page).toBeDefined();
  });
});

describe("binding rule 4 on the bounce (AC-24)", () => {
  it("opens sign_in.bounce before the error parameter guard returns", async () => {
    claimsBehaviour = signedIn;

    await renderWith({ error: "no_code" });

    /**
     * The error parameter is the earliest return in the decision, so a span
     * opened after it would miss every failed sign in, which is precisely the
     * population whose failure rate matters. The span measures "decide whether
     * to bounce", not "render /sign-in", so a signed out render sits outside it.
     */
    expect(openedSpans).toEqual(["sign_in.bounce"]);
  });

  it("opens the landing rule's span inside it when it actually decides", async () => {
    claimsBehaviour = signedIn;

    await bounceFrom({});

    expect(openedSpans).toEqual(["sign_in.bounce", "landing_rule.decide"]);
  });

  it("does not run the landing rule when a deep link already decided", async () => {
    claimsBehaviour = signedIn;

    await bounceFrom({ next: "/applications" });

    // No pointless database read: the destination was already known.
    expect(openedSpans).toEqual(["sign_in.bounce"]);
  });
});

describe("the deep link reaches the provider forms (AC-13)", () => {
  /** Every hidden `next` field the page rendered, with its value. */
  async function hiddenFields(query: Query): Promise<readonly string[]> {
    const page = await renderWith(query);

    return flatten(renderDeep(page, [Button, Logo]))
      .filter((element) => element.type === "input")
      .map((element) => element.props as { name?: string; value?: string })
      .filter((props) => props.name === "next")
      .map((props) => props.value ?? "");
  }

  it("puts the accepted value in both provider forms", async () => {
    /**
     * BOTH, not one. The two forms post to different Server Actions, and a
     * value carried by only one would make the deep link work with Google and
     * silently vanish with GitHub, which is the kind of bug nobody reproduces.
     */
    expect(await hiddenFields({ next: "/search?q=react" })).toEqual([
      "/search?q=react",
      "/search?q=react",
    ]);
  });

  it("renders no field at all when there is nothing to carry", async () => {
    // An absent value is not an empty string; a form with nothing to say ships
    // no field rather than an empty one for the action to parse.
    expect(await hiddenFields({})).toEqual([]);
  });

  it("never echoes a refused value back onto the page", async () => {
    /**
     * The value is attacker supplied by construction: anyone can send a victim
     * `/sign-in?next=<anything>`. Echoing a refused one into a hidden field
     * would hand them a page that carries their own string back into a form.
     */
    expect(await hiddenFields({ next: "//evil.com" })).toEqual([]);
    expect(await hiddenFields({ next: "javascript:alert(1)" })).toEqual([]);
  });

  it("ignores a repeated parameter rather than reading the first", async () => {
    // `?next=a&next=b` arrives as an array. That is a malformed request, so it
    // carries nothing rather than quietly picking one.
    expect(await hiddenFields({ next: ["/search", "//evil.com"] })).toEqual([]);
  });
});
