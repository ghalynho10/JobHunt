import { NextResponse, type NextRequest } from "next/server";

import { completeSignIn } from "@/features/auth/callback";
import { signInErrorPath } from "@/features/auth/failure-codes";
import { currentOrigin } from "@/lib/origin";

/**
 * The OAuth return leg (spec 0007, AC-3, AC-4, AC-5).
 *
 * DELIBERATELY NOT UNDER `src/app/api/`. Binding rule 6 says a route handler
 * there may not read or write user data, and this one writes the session
 * cookies. Putting it at `/auth/callback` keeps that rule intact rather than
 * carving an exception into it.
 *
 * Thin on purpose: the decision lives in `src/features/auth/callback.ts`,
 * because a feature's code belongs under `src/features/<feature>/` and routes
 * live only in `src/app`.
 *
 * IT NEVER 500s TO THE BROWSER. Every path is a redirect, so a person who fails
 * to sign in lands on a page that says what happened rather than on a stack
 * trace or an empty screen.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const outcome = await completeSignIn(request.nextUrl.searchParams);

  /**
   * The landing path is the literal `/health`, and it is provisional: the real
   * post sign in destination belongs to the app shell feature (spec 0007,
   * `## Consequences`). Until feature 9 exists, a brand new user lands there and
   * sees `record_not_found`, which is the tracer bullet working out loud rather
   * than a defect.
   */
  const path = outcome.signedIn ? "/health" : signInErrorPath(outcome.code);

  /**
   * The base is `currentOrigin()`, not a request header and not
   * `canonicalSiteUrl` (invariant 5). It is the same origin `redirectTo` was
   * built from, which is the host holding the code verifier cookie, so the
   * person is returned to where their session actually is.
   *
   * 303 rather than 307: the handshake is finished and the browser should GET
   * the destination, not repeat anything.
   */
  return NextResponse.redirect(new URL(path, currentOrigin()), 303);
}
