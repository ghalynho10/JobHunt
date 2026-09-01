import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

import { landingPathFor } from "@/lib/landing-rule";
import { currentOrigin } from "@/lib/origin";
import { attempt, isFailure } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

/**
 * The door (spec 0008, AC-17, AC-17a, AC-24, AC-24a).
 *
 * WHAT IT IS FOR. `/` is a static page that reads no session, and that is its
 * whole value: spec 0006's accepted contract. But a page that cannot tell who is
 * reading it was inviting everybody to sign in, including people already signed
 * in. This route is the one place that reads the session on their behalf, so `/`
 * can keep reading nothing and stop being wrong at the same time.
 *
 * DELIBERATELY NOT UNDER `src/app/api/`, the same placement `/auth/callback`
 * uses. Binding rule 6 restricts handlers UNDER `src/app/api/` and is silent
 * about handlers elsewhere, so this respects the rule rather than claiming an
 * exception from it. It verifies its own caller before the read, and row level
 * security remains the guarantee behind the landing rule's query.
 *
 * IT IMPORTS NOTHING FROM `src/features/` (AC-5b). The landing rule lives in
 * `src/lib` precisely so this handler and the proxy can reach it.
 */
export async function GET(): Promise<NextResponse> {
  const path = await destination();

  const response = NextResponse.redirect(new URL(path, currentOrigin()), 307);

  /**
   * `no-store` IS A SECURITY REQUIREMENT HERE, NOT A PERFORMANCE NOTE (AC-17).
   * This route answers a different destination per visitor, so a cached redirect
   * would send one person to another person's landing target.
   */
  response.headers.set("Cache-Control", "no-store");

  /** Nothing about a per visitor redirect belongs in an index. */
  response.headers.set("X-Robots-Tag", "noindex");

  return response;
}

/**
 * Where this visitor should be sent.
 *
 * `redirect()` is not used and `NextResponse.redirect` is built by the caller,
 * OUTSIDE the span (AC-24a), so the operation the span measures is the decision
 * rather than the response.
 */
async function destination(): Promise<string> {
  /**
   * BINDING RULE 4: the named span opens as the FIRST statement, before any
   * guard clause or early return. Registered in `docs/observability/spans.md`.
   */
  return Sentry.startSpan(
    { name: "door.decide", op: "function" },
    async (): Promise<string> => {
      const supabase = await createClient();

      /** BINDING RULE 5: `getClaims()` reaches the JWKS endpoint and can throw. */
      const attempted = await attempt(
        {
          kind: "external_service_failed",
          message: "Could not verify the session at the door.",
        },
        () => supabase.auth.getClaims(),
      );

      /**
       * AC-17a: AN ERRORED READ IS A THIRD STATE, and here it is treated like
       * signed out. Running the landing rule for a caller whose identity was
       * never confirmed is the one outcome to avoid, so this fails toward the
       * sign in surface. The `/sign-in` bounce makes the opposite choice for the
       * same reason: neither route ever assumes a session.
       */
      if (isFailure(attempted)) return "/sign-in";

      const { data, error } = attempted.value;

      if (error || !data) return "/sign-in";

      return landingPathFor(data.claims.sub);
    },
  );
}
