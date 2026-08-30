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
 * `/sign-in` carries the client boundary directive, so spec 0006 AC-4 still
 * holds: the entry page ships zero client JavaScript after this feature lands.
 * Both provider controls are plain `<form action={...}>` submits, which work
 * with JavaScript switched off.
 *
 * The directive is described rather than quoted anywhere in this feature, on
 * purpose. Spec 0006's AC-4 is checked by a plain recursive grep for that
 * phrase across `src/`, so a comment that spelled it out would answer that
 * check with itself and every later reader would have to re read the hits to
 * find the real ones.
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
 * GitHub.
 *
 * `user:email` IS NAMED HERE TO CONFIRM A DEFAULT, NOT TO ADD A SCOPE, and the
 * distinction is the whole reason this comment exists. P8 reached GitHub's
 * authorization screen with no scope parameter in the URL at all and it still
 * requested "Personal user data, Email addresses (read only)", so Supabase's
 * GitHub provider already asks for it. Naming it means nobody later strips it
 * as redundant, and nobody later re adds it believing it was missing.
 *
 * It is load bearing either way: automatic linking (AC-8) fires only on a
 * VERIFIED email address, so a handshake that came back without one would
 * refuse a signup that should have linked, and the symptom would look like a
 * broken hook rather than a missing scope.
 */
export async function signInWithGitHub(): Promise<void> {
  const started = await startProviderSignIn("github", "user:email");

  if (isFailure(started)) {
    redirect(signInErrorPath("provider_unavailable"));
  }

  redirect(started.value);
}

/**
 * Sign out, from wherever the person is signed in (spec 0007, AC-11).
 *
 * BEST EFFORT BUT NEVER SILENT (invariant 6). A failing sign out still clears
 * what it can, still reports, and still redirects, because leaving somebody on
 * a page that looks signed in is worse than sending them home with a session
 * the server already gave up on.
 *
 * IT CONSTRUCTS A `failure()` RATHER THAN RETURNING ONE, which looks like a
 * discarded value and is not. `failure()` reports and marks the span failed as
 * its own effect, and this function ends in `redirect()`, which works by
 * throwing, so no caller ever regains control to read a returned value. A
 * returned failure here would be a value nothing can receive.
 */
export async function signOut(): Promise<void> {
  /** BINDING RULE 4: the span opens first. */
  await Sentry.startSpan(
    { name: "auth.sign_out", op: "auth" },
    async (): Promise<void> => {
      const supabase = await createClient();

      /** BINDING RULE 5: the auth client may throw rather than return. */
      const attempted = await attempt(
        {
          kind: "external_service_failed",
          message: "Sign out did not complete cleanly.",
        },
        () => supabase.auth.signOut(),
      );

      /** `attempt()` has already built and reported the failure on a throw. */
      if (isFailure(attempted)) return;

      const { error } = attempted.value;

      if (error) {
        failure({
          kind: "external_service_failed",
          severity: "unexpected",
          message: "Sign out did not complete cleanly.",
          context: { status: error.status, detail: error.message },
          cause: error,
        });
      }
    },
  );

  /**
   * Outside the span, because `redirect()` throws and a throw inside would be
   * recorded as this operation failing. The destination is the literal `/`.
   */
  redirect("/");
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
