import "server-only";

import * as Sentry from "@sentry/nextjs";

import { attempt, failure, isFailure } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

import { AUTH_FAILURES, type AuthErrorCode } from "./failure-codes";

/**
 * The return leg of the handshake (spec 0007, AC-3, AC-5, AC-6).
 *
 * The logic lives here rather than in the route handler because a feature's
 * code lives under `src/features/<feature>/` and routes live only in `src/app`.
 * The handler at `src/app/auth/callback/route.ts` is the thin shell that turns
 * this outcome into a redirect.
 *
 * NOT UNDER `src/app/api/`, on purpose. Binding rule 6 forbids a route handler
 * there from reading or writing user data, and this one writes the session
 * cookies, so AC-3 places it at `/auth/callback` instead and that rule is left
 * untouched.
 */

/**
 * What happened, in the shape the caller needs.
 *
 * NOT a `Result`, and the difference is deliberate. Every failing branch below
 * still builds its failure through `failure()` (binding rule 2), which is what
 * reports it and marks the span failed. What the caller needs on top of that is
 * the enum member to put on the redirect, and a `Failure` carries a kind, not a
 * sign in code. So this type carries the code and `failure()` keeps its job.
 *
 * `signedIn` is the discriminant rather than `ok`, so nothing here reads as a
 * hand written `Result` that skipped the constructor.
 */
export type SignInOutcome =
  | { readonly signedIn: true }
  | { readonly signedIn: false; readonly code: AuthErrorCode };

/**
 * Exchange the code GoTrue sent back for a real session, or classify why not.
 *
 * @param params The callback's query string.
 * @returns Signed in, or the one enum member the redirect will carry.
 */
export async function completeSignIn(
  params: URLSearchParams,
): Promise<SignInOutcome> {
  /** BINDING RULE 4: the span opens first, before any guard clause. */
  return Sentry.startSpan(
    { name: "auth.callback", op: "auth" },
    async (): Promise<SignInOutcome> => {
      const code = params.get("code") ?? undefined;
      const providerError = params.get("error") ?? undefined;
      const description = params.get("error_description") ?? undefined;

      if (providerError !== undefined || code === undefined) {
        return refuse(providerError, description);
      }

      const supabase = await createClient();

      /** BINDING RULE 5: the auth client may throw rather than return. */
      const attempted = await attempt(
        {
          kind: AUTH_FAILURES.exchange_failed.kind,
          message: AUTH_FAILURES.exchange_failed.message,
        },
        () => supabase.auth.exchangeCodeForSession(code),
      );

      if (isFailure(attempted)) {
        return { signedIn: false, code: "exchange_failed" };
      }

      const { error } = attempted.value;

      if (error) {
        failure({
          kind: AUTH_FAILURES.exchange_failed.kind,
          severity: AUTH_FAILURES.exchange_failed.severity,
          message: AUTH_FAILURES.exchange_failed.message,
          /**
           * AC-4's host only cookie case lands here: a sign in started on one
           * host and returned to another has no code verifier to exchange
           * against. That is documented expected behaviour on a per commit
           * preview URL, and `COPY-4` tells the person to start again from the
           * sign in page, which is exactly what fixes it.
           */
          context: { status: error.status, detail: error.message },
          cause: error,
        });

        return { signedIn: false, code: "exchange_failed" };
      }

      return { signedIn: true };
    },
  );
}

/**
 * Classify an arrival that carries no session to build: either the provider
 * said no, or there was no code to exchange.
 *
 * SPEC 0007, `## Feature design`, **Failure codes**. The mapping is fixed here
 * rather than derived from the provider's own string, so no provider text can
 * decide what this product says (invariant 4).
 *
 * `access_denied` is matched exactly, because it is the OAuth 2.0 error code a
 * provider returns when the person refuses consent, not a guess at wording.
 *
 * ANY OTHER `error` VALUE FALLS TO `no_code`, which is the spec's state
 * transition read literally ("at /auth/callback, no code"): whatever the
 * provider called it, this callback was reached with nothing to exchange. It is
 * classified `expected`, and that does NOT hide an outage, because `failure()`
 * marks the span failed at either severity and binding rule 4 alerts on the
 * share of attempts that fail rather than on severity. The provider's own
 * `error_description` goes to Sentry as context either way.
 */
function refuse(
  providerError: string | undefined,
  description: string | undefined,
): SignInOutcome {
  const code: AuthErrorCode =
    providerError === "access_denied" ? "access_denied" : "no_code";

  failure({
    kind: AUTH_FAILURES[code].kind,
    severity: AUTH_FAILURES[code].severity,
    message: AUTH_FAILURES[code].message,
    /** AC-5: the provider's words reach Sentry and never reach the page. */
    context: { providerError, description },
  });

  return { signedIn: false, code };
}
