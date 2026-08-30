import { describe, expect, it } from "vitest";

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
