import { z } from "zod";

import type { FailureKind, FailureSeverity } from "@/lib/result";

/**
 * The closed set of sign in failure codes (spec 0007, `## Feature design`,
 * **Failure codes**), and the kind and severity each one carries.
 *
 * SPEC 0007, AC-7: this is the only vocabulary `/sign-in?error=` speaks. The
 * value arriving on that query string is untrusted, so it is parsed against
 * this enum at the boundary and an unrecognised value is never echoed back to
 * the page. The provider's own `error_description` reaches Sentry and stops
 * there (AC-5).
 *
 * SPEC 0007, AC-6: the kind and severity below are the spec's, not chosen at
 * the call site. An ordinary denial (a cancelled consent, a refused signup) is
 * `expected` and raises no alert; a failed exchange or an unreachable provider
 * is `unexpected`. Both still mark their span failed inside `failure()`, so
 * binding rule 4's ratio alert counts every one of them either way, which is
 * what keeps an `expected` classification from hiding an outage.
 */

/** The five members, in the order the spec's table lists them. */
export const AUTH_ERROR_CODES = [
  "access_denied",
  "account_exists",
  "no_code",
  "exchange_failed",
  "provider_unavailable",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

/**
 * The boundary parse for the `error` query parameter (AC-7).
 *
 * Deliberately a closed enum rather than a string: an unknown value falls to
 * the page's one generic sentence rather than being rendered, so no provider
 * text and no attacker supplied text can reach a rendered page (invariant 4).
 */
export const authErrorCodeSchema = z.enum(AUTH_ERROR_CODES);

interface AuthFailureShape {
  readonly kind: FailureKind;
  readonly severity: FailureSeverity;
  /**
   * What goes to Sentry. Safe to show a user by the `Failure` contract, but the
   * page never renders it: AC-5 puts the engineer's own sentence on screen,
   * keyed by the code, so this text and the copy are separate on purpose.
   */
  readonly message: string;
}

/**
 * The spec's **Failure codes** table, as a value.
 *
 * A table rather than a `switch` at each call site, so a code cannot be raised
 * with a severity somebody picked in the moment. Adding a code means adding a
 * member above and a row here, and the type makes both mandatory.
 */
export const AUTH_FAILURES: Readonly<Record<AuthErrorCode, AuthFailureShape>> =
  {
    /** The person cancelled at the provider's consent screen. */
    access_denied: {
      kind: "session_missing",
      severity: "expected",
      message: "Sign in was cancelled at the provider.",
    },
    /** The hook refused the signup: this email already belongs to an identity. */
    account_exists: {
      kind: "session_missing",
      severity: "expected",
      message:
        "Signup refused: that email already belongs to another identity.",
    },
    /** The callback was reached with no code, which is malformed, not an outage. */
    no_code: {
      kind: "validation_failed",
      severity: "expected",
      message: "The sign in callback was reached without a code to exchange.",
    },
    /** `exchangeCodeForSession` failed, including AC-4's host only cookie case. */
    exchange_failed: {
      kind: "external_service_failed",
      severity: "unexpected",
      message: "The sign in code could not be exchanged for a session.",
    },
    /** `signInWithOAuth` failed before the person ever left the site. */
    provider_unavailable: {
      kind: "external_service_failed",
      severity: "unexpected",
      message: "The sign in provider could not be reached.",
    },
  };

/**
 * Where every failing path sends the person (spec 0007, AC-5).
 *
 * IT CARRIES THE RETURN PATH FORWARD WHEN THERE IS ONE (spec 0008, AC-14a). A
 * visitor who followed a deep link, failed to sign in, and retried from this
 * page would otherwise lose the link that brought them here, and the two error
 * paths into this page would behave differently from each other by accident.
 * One function builds the URL so both stay the same.
 *
 * @param code The closed enum member the page renders a sentence for.
 * @param returnPath An ALREADY VALIDATED return path, or `undefined`. Callers
 * pass the output of `parseReturnPath()`, never a raw value: this function
 * encodes what it is given and does not judge it.
 */
export function signInErrorPath(
  code: AuthErrorCode,
  returnPath?: string,
): string {
  const query = new URLSearchParams({ error: code });

  if (returnPath !== undefined) query.set("next", returnPath);

  return `/sign-in?${query.toString()}`;
}
