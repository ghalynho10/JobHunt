import { NextResponse, type NextRequest } from "next/server";

import { completeSignIn } from "@/features/auth/callback";
import { signInErrorPath } from "@/features/auth/failure-codes";
import { landingPathFor } from "@/lib/landing-rule";
import { currentOrigin } from "@/lib/origin";
import {
  RETURN_PATH_COOKIE,
  RETURN_PATH_COOKIE_PATH,
  parseReturnPathCookie,
} from "@/lib/return-path";

/**
 * The OAuth return leg (spec 0007 AC-3, AC-4, AC-5; spec 0008 AC-15, AC-16).
 *
 * DELIBERATELY NOT UNDER `src/app/api/`. Binding rule 6 says a route handler
 * there may not read or write user data, and this one writes the session
 * cookies. Putting it at `/auth/callback` keeps that rule intact rather than
 * carving an exception into it.
 *
 * Thin on purpose: the decision lives in `src/features/auth/callback.ts`,
 * because a feature's code belongs under `src/features/<feature>/` and routes
 * live only in `src/app`. What is here is the part that cannot live anywhere
 * else: turning an outcome into a redirect, and the lifecycle of the return
 * cookie, which needs the response object.
 *
 * IT NEVER 500s TO THE BROWSER. Every path is a redirect, so a person who fails
 * to sign in lands on a page that says what happened rather than on a stack
 * trace or an empty screen.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  /**
   * READ BEFORE ANYTHING ELSE RUNS, and cleared on EVERY path below (AC-15). A
   * value left behind would fire at some later sign in and send that person
   * somewhere they never asked to go.
   */
  const returnPath = parseReturnPathCookie(
    request.cookies.get(RETURN_PATH_COOKIE)?.value,
  );

  const outcome = await completeSignIn(request.nextUrl.searchParams);

  /**
   * AC-16: the deep link wins when there is one, and the landing rule decides
   * when there is not. AC-14a: a failed arrival carries the value onto
   * `/sign-in`, so a visitor who retries keeps the link that brought them here.
   *
   * The landing rule runs on the identity the exchange just resolved (AC-15a),
   * so nothing here re-reads the session.
   */
  const path = outcome.signedIn
    ? (returnPath ?? (await landingPathFor(outcome.userId)))
    : signInErrorPath(outcome.code, returnPath);

  /**
   * The base is `currentOrigin()`, not a request header and not
   * `canonicalSiteUrl` (invariant 5). It is the same origin `redirectTo` was
   * built from, which is the host holding the code verifier cookie, so the
   * person is returned to where their session actually is.
   *
   * 303 rather than 307: the handshake is finished and the browser should GET
   * the destination, not repeat anything.
   */
  const response = NextResponse.redirect(new URL(path, currentOrigin()), 303);

  /**
   * THE CLEAR REPEATS THE EXACT `Path` THE COOKIE WAS WRITTEN WITH, or it
   * silently fails to match and the value survives. It runs unconditionally: on
   * the way to a deep link, on the way to the landing rule, when the value was
   * refused, and when the provider returned an error. There is no path out of
   * this handler that leaves it behind.
   */
  response.cookies.set(RETURN_PATH_COOKIE, "", {
    path: RETURN_PATH_COOKIE_PATH,
    maxAge: 0,
  });

  return response;
}
