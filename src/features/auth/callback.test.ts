import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { capturedEvents } from "../../../test/setup/sentry-transport";

import { classify } from "./callback";
import { AUTH_FAILURES } from "./failure-codes";

/**
 * How the callback classifies an arrival that carries no session (spec 0007,
 * AC-5 and AC-6).
 *
 * A unit test, because the mapping is a pure decision and the value of proving
 * it is in the edges: the hook's refusal and a genuine GoTrue fault arrive under
 * the SAME `error=server_error`, so only the description separates them, and
 * getting that backwards would show the wrong sentence to everybody whose sign
 * in failed.
 *
 * The other half, that the marker still matches the message the real hook
 * actually produces, cannot be proved here and is not faked here. It lives in
 * `test/integration/auth-hook.test.ts`, which drives the real function.
 */

describe("what the callback calls each arrival", () => {
  it("calls a cancelled consent access_denied (covers AC-5)", () => {
    expect(classify("access_denied", "The user denied the request")).toBe(
      "access_denied",
    );
  });

  it("calls an arrival with nothing on it no_code (covers AC-5)", () => {
    expect(classify(undefined, undefined)).toBe("no_code");
  });

  /**
   * The hook's refusal, in the shape P10 proved it arrives in on 2026-08-30:
   * `error=server_error`, an empty `error_code`, and the hook's own message in
   * `error_description`.
   */
  it("calls the hook's refusal account_exists (covers AC-5, AC-9)", () => {
    expect(
      classify(
        "server_error",
        "That email address already signs in with Google. Use that option instead and you will reach the same account.",
      ),
    ).toBe("account_exists");
  });

  /**
   * THE PAIR THAT MATTERS. Same `error` value, different description, different
   * answer. A classifier that read `error` alone would call both of these
   * `account_exists` and tell somebody hitting a real outage that their account
   * exists elsewhere.
   */
  it("does not call a genuine server error account_exists (covers AC-6)", () => {
    expect(classify("server_error", "Internal server error")).toBe("no_code");
  });

  it("ignores a description that merely mentions the marker later on", () => {
    expect(
      classify(
        "server_error",
        "Unexpected: That email address already signs in with Google.",
      ),
    ).toBe("no_code");
  });
});

/**
 * AC-6: each code carries the kind and severity the spec's table gives it, so an
 * ordinary denial never competes with an outage in the alerting. Read off the
 * table as a value, because the point is that no call site gets to choose.
 */
describe("the severity each code carries", () => {
  it.each([
    ["access_denied", "session_missing", "expected"],
    ["account_exists", "session_missing", "expected"],
    ["no_code", "validation_failed", "expected"],
    ["exchange_failed", "external_service_failed", "unexpected"],
    ["provider_unavailable", "external_service_failed", "unexpected"],
  ] as const)("files %s as %s and %s (covers AC-6)", (code, kind, severity) => {
    expect(AUTH_FAILURES[code].kind).toBe(kind);
    expect(AUTH_FAILURES[code].severity).toBe(severity);
  });

  /**
   * A cancelled consent and a refused signup raise no alert. They are the two
   * the spec singles out, because they are ordinary and frequent, and treating
   * either as an outage would train everybody to ignore the alert.
   */
  it("keeps both ordinary denials out of the error level (covers AC-6)", () => {
    expect(AUTH_FAILURES.access_denied.severity).toBe("expected");
    expect(AUTH_FAILURES.account_exists.severity).toBe("expected");
  });
});

/**
 * `completeSignIn()` itself (spec 0007, AC-3, AC-4, AC-5, AC-6).
 *
 * WHY THIS BLOCK EXISTS. The `/check review` pass on 2026-08-31 found that only
 * `classify()`, the pure helper, had any test, while the function that actually
 * exchanges the code for a session had none. Its branching was proved once by
 * hand during `/check verify` and nothing guarded it afterwards, so a refactor
 * that reordered the guard and the exchange, or that returned `signedIn: true`
 * on the error path, would have passed the whole suite.
 *
 * The boundary is mocked, nothing this project owns is. `createClient()` is the
 * Supabase SDK and is replaced; `attempt()`, `failure()` and `classify()` all
 * run for real, because they are the behaviour under test rather than scaffolding
 * around it. `Sentry.startSpan` is wrapped by a proxy that records the span and
 * then calls the real one, so binding rule 4 is observed rather than simulated.
 */

interface ExchangeError {
  readonly status?: number;
  readonly message: string;
}

/** Recorded per test, so an assertion can read what the SDK was actually asked. */
let exchangeCalls: string[] = [];
let openedSpans: { name: string; op?: string }[] = [];

/**
 * The user the exchange resolves, whose id the callback hands to the landing
 * rule (spec 0008, AC-15a). Shaped like the SDK's own response rather than
 * invented: a successful exchange always carries a user.
 */
const EXCHANGED_USER_ID = "8f1a4e6c-2b3d-4f57-9a10-6d5c8e2b7a44";

/** Set per test to choose how the boundary behaves. */
let exchangeBehaviour: () => Promise<{
  data: { user: { id: string } | null };
  error: ExchangeError | null;
}>;

beforeEach(() => {
  vi.resetModules();
  exchangeCalls = [];
  openedSpans = [];
  exchangeBehaviour = () =>
    Promise.resolve({ data: { user: { id: EXCHANGED_USER_ID } }, error: null });
});

afterEach(() => {
  vi.resetModules();
});

/**
 * Re-imports the module with the Supabase boundary replaced.
 *
 * The `Sentry` wrapper is a proxy rather than a spread of the namespace: this
 * module's `failure()` path reaches for `getActiveSpan`, and spreading the
 * namespace silently drops exports, which surfaces far away as a missing
 * function rather than as a mocking mistake.
 */
async function loadCallback() {
  vi.doMock("@/lib/supabase/server", () => ({
    createClient: () =>
      Promise.resolve({
        auth: {
          exchangeCodeForSession: (code: string) => {
            exchangeCalls.push(code);
            return exchangeBehaviour();
          },
        },
      }),
  }));

  const actualSentry =
    await vi.importActual<typeof import("@sentry/nextjs")>("@sentry/nextjs");

  vi.doMock(
    "@sentry/nextjs",
    () =>
      new Proxy(actualSentry, {
        get: (target, property, receiver) =>
          property === "startSpan"
            ? (
                options: { name: string; op?: string },
                callback: (...args: never[]) => unknown,
              ) => {
                openedSpans.push({ name: options.name, op: options.op });
                return actualSentry.startSpan(
                  options as Parameters<typeof actualSentry.startSpan>[0],
                  callback as Parameters<typeof actualSentry.startSpan>[1],
                );
              }
            : Reflect.get(target, property, receiver),
      }),
  );

  return import("./callback");
}

describe("completing the sign in at the callback", () => {
  it("returns signed in when the code exchanges cleanly (covers AC-3)", async () => {
    const { completeSignIn } = await loadCallback();

    const outcome = await completeSignIn(
      new URLSearchParams("code=a-real-looking-code"),
    );

    /**
     * SPEC 0008, AC-15a: the identity comes back with the outcome, so the
     * callback can run the landing rule without building a second client to ask
     * who just signed in.
     */
    expect(outcome).toEqual({ signedIn: true, userId: EXCHANGED_USER_ID });
    expect(exchangeCalls).toEqual(["a-real-looking-code"]);
  });

  /**
   * AC-4's host only cookie case lands here: a sign in started on one host and
   * returned to another has no verifier to exchange against, so GoTrue answers
   * with an error rather than throwing.
   */
  it("calls a returned exchange error exchange_failed (covers AC-5)", async () => {
    exchangeBehaviour = () =>
      Promise.resolve({
        data: { user: null },
        error: {
          status: 400,
          message: "invalid request: code verifier missing",
        },
      });

    const { completeSignIn } = await loadCallback();

    expect(await completeSignIn(new URLSearchParams("code=stale"))).toEqual({
      signedIn: false,
      code: "exchange_failed",
    });
  });

  /**
   * BINDING RULE 5: the auth client may throw rather than return, and
   * `attempt()` is what stops that escaping. A throw has to land on the same
   * code a returned error does, or one person sees a crash where another sees a
   * sentence.
   */
  it("calls a thrown exchange exchange_failed too (covers AC-5)", async () => {
    exchangeBehaviour = () => Promise.reject(new Error("socket hang up"));

    const { completeSignIn } = await loadCallback();

    expect(await completeSignIn(new URLSearchParams("code=whatever"))).toEqual({
      signedIn: false,
      code: "exchange_failed",
    });
  });

  it("reports a failed exchange at error level, not as an ordinary denial (covers AC-6)", async () => {
    exchangeBehaviour = () =>
      Promise.resolve({
        data: { user: null },
        error: { status: 400, message: "verifier missing" },
      });

    const { completeSignIn } = await loadCallback();

    await completeSignIn(new URLSearchParams("code=stale"));

    const reported = capturedEvents();
    expect(reported).toHaveLength(1);
    expect(reported[0]?.level).toBe("error");
    expect(reported[0]?.tags).toMatchObject({
      "failure.kind": "external_service_failed",
      "failure.severity": "unexpected",
    });
  });
});

describe("the arrivals that never reach an exchange", () => {
  /**
   * A cancelled consent must not attempt an exchange. There is nothing to
   * exchange, and trying would turn an ordinary denial into an SDK round trip
   * and a second, misleading failure.
   */
  it("refuses a cancelled consent without calling the SDK (covers AC-5)", async () => {
    const { completeSignIn } = await loadCallback();

    expect(
      await completeSignIn(new URLSearchParams("error=access_denied")),
    ).toEqual({ signedIn: false, code: "access_denied" });
    expect(exchangeCalls).toEqual([]);
  });

  it("refuses an arrival with nothing on it without calling the SDK (covers AC-5)", async () => {
    const { completeSignIn } = await loadCallback();

    expect(await completeSignIn(new URLSearchParams(""))).toEqual({
      signedIn: false,
      code: "no_code",
    });
    expect(exchangeCalls).toEqual([]);
  });

  /**
   * The hook's refusal, driven through the whole function rather than through
   * `classify()` alone, in the shape P10 proved it arrives in: `server_error`
   * with the hook's own message in `error_description`.
   */
  it("carries the hook's refusal through to account_exists (covers AC-5, AC-9)", async () => {
    const { completeSignIn } = await loadCallback();

    const outcome = await completeSignIn(
      new URLSearchParams({
        error: "server_error",
        error_code: "",
        error_description:
          "That email address already signs in with Google. Use that option instead and you will reach the same account.",
      }),
    );

    expect(outcome).toEqual({ signedIn: false, code: "account_exists" });
    expect(exchangeCalls).toEqual([]);
  });

  /**
   * AC-5, invariant 4. The provider's own words go to Sentry as context and
   * reach the page nowhere. The outcome carries an enum member and nothing else,
   * which is what stops provider text being rendered.
   */
  it("keeps the provider's words out of the outcome and sends them to Sentry (covers AC-5)", async () => {
    const { completeSignIn } = await loadCallback();

    const outcome = await completeSignIn(
      new URLSearchParams({
        error: "access_denied",
        error_description: "The user did not consent to scope xyz",
      }),
    );

    expect(JSON.stringify(outcome)).not.toContain("scope xyz");
    expect(Object.keys(outcome)).toEqual(["signedIn", "code"]);
    expect(capturedEvents()).toHaveLength(1);
  });
});

describe("binding rule 4 at the callback: the named span opens first", () => {
  it("opens auth.callback on the path that exchanges a code", async () => {
    const { completeSignIn } = await loadCallback();

    await completeSignIn(new URLSearchParams("code=a-real-looking-code"));

    expect(openedSpans).toEqual([{ name: "auth.callback", op: "auth" }]);
  });

  /**
   * THE ORDERING THE RULE IS ABOUT. The guard clause returns before any SDK call
   * is made, so a span opened after it would leave every refused arrival
   * unrecorded, the ratio would count only the arrivals that got as far as an
   * exchange, and a total denial outage would produce no spans at all.
   */
  it("opens the span even when a guard clause returns before any SDK call", async () => {
    const { completeSignIn } = await loadCallback();

    await completeSignIn(new URLSearchParams("error=access_denied"));

    expect(exchangeCalls).toEqual([]);
    expect(openedSpans).toEqual([{ name: "auth.callback", op: "auth" }]);
  });
});

describe("an exchange that produced no user (spec 0008, AC-15a)", () => {
  it("refuses rather than reporting a session nobody owns", async () => {
    exchangeBehaviour = () =>
      Promise.resolve({ data: { user: null }, error: null });

    const { completeSignIn } = await loadCallback();

    /**
     * NO ERROR AND NO USER IS NOT A SESSION, whatever it looks like. Reporting
     * it as signed in would run the landing rule for nobody, read as an empty
     * profile, and send a stranger to `/profile` with no failure anywhere.
     */
    expect(await completeSignIn(new URLSearchParams("code=hollow"))).toEqual({
      signedIn: false,
      code: "exchange_failed",
    });

    // Visible, not silent: the impossible case still reports.
    expect(capturedEvents()).toHaveLength(1);
  });
});
