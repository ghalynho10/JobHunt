"use server";

import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";

import { currentOrigin } from "@/lib/origin";
import {
  attempt,
  failure,
  isFailure,
  success,
  type Result,
} from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

import { signInErrorPath, AUTH_FAILURES } from "./failure-codes";

/**
 * The sign in actions (spec 0007, AC-2, AC-4, AC-5, AC-6).
 *
 * THE WHOLE HANDSHAKE RUNS ON THE SERVER. No file reachable from `/` or from
 * `/sign-in` carries `"use client"`, so spec 0006 AC-4 still holds: the entry
 * page ships zero client JavaScript after this feature lands. Both provider
 * controls are plain `<form action={...}>` submits, which work with JavaScript
 * switched off.
 *
 * ONE ACTION PER PROVIDER, NOT ONE TAKING A PROVIDER ARGUMENT. The set is
 * closed at two, and a provider name arriving from a form would be untrusted
 * input needing its own boundary parse for nothing gained (spec 0007,
 * `## Feature design`, API surface).
 */

/** The return leg. AC-3 puts it here, not under `src/app/api/`. */
const CALLBACK_PATH = "/auth/callback";

/**
 * Google.
 *
 * `redirect()` is called OUTSIDE the span and outside `attempt()` on purpose:
 * it works by throwing, so a call inside either would be recorded as this
 * operation failing when it in fact succeeded.
 */
export async function signInWithGoogle(): Promise<void> {
  const started = await startProviderSignIn("google");

  if (isFailure(started)) {
    redirect(signInErrorPath("provider_unavailable"));
  }

  redirect(started.value);
}

/**
 * Ask Supabase for the provider URL to send the person to.
 *
 * @param provider A literal at each call site, never form input.
 * @param scopes Extra scopes, when the provider needs them named.
 * @returns The provider URL to redirect to, or a failure that has already
 * reported.
 */
async function startProviderSignIn(
  provider: "google" | "github",
  scopes?: string,
): Promise<Result<string>> {
  /** BINDING RULE 4: the span opens first, before anything that can return. */
  return Sentry.startSpan(
    { name: "auth.sign_in", op: "auth", attributes: { provider } },
    async (): Promise<Result<string>> => {
      const supabase = await createClient();

      /**
       * SPEC 0007, AC-4. `redirectTo` is built from `currentOrigin()` and never
       * from `canonicalSiteUrl`, which is the production origin in every
       * environment (invariant 5). It carries no untrusted input, so the
       * Supabase allowlist is a second line of defence rather than the only one
       * (invariant 3).
       *
       * `currentOrigin()` throws on a preview with no branch URL rather than
       * guessing. That is deliberate and it stays inside the span, so a
       * configuration bug reaches an error boundary with its stack intact
       * instead of becoming a redirect quietly pointed at production.
       */
      const redirectTo = `${currentOrigin()}${CALLBACK_PATH}`;

      /** BINDING RULE 5: the provider SDK may throw rather than return. */
      const attempted = await attempt(
        {
          kind: AUTH_FAILURES.provider_unavailable.kind,
          message: AUTH_FAILURES.provider_unavailable.message,
          context: { provider },
        },
        () =>
          supabase.auth.signInWithOAuth({
            provider,
            options:
              scopes === undefined ? { redirectTo } : { redirectTo, scopes },
          }),
      );

      if (isFailure(attempted)) return attempted;

      const { data, error } = attempted.value;

      if (error) {
        return failure({
          kind: AUTH_FAILURES.provider_unavailable.kind,
          severity: AUTH_FAILURES.provider_unavailable.severity,
          message: AUTH_FAILURES.provider_unavailable.message,
          /**
           * The provider's own words go to Sentry and stop there (AC-5,
           * invariant 4). The page renders this product's sentence instead.
           */
          context: { provider, status: error.status, detail: error.message },
          cause: error,
        });
      }

      /**
       * The URL comes from `data.url`, never built by hand, so the PKCE
       * challenge and state Supabase put in it stay intact.
       */
      return success(data.url);
    },
  );
}
