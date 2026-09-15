import { createHash, timingSafeEqual } from "node:crypto";

import { env } from "@/env";
import { refreshDemoResults } from "@/features/demo/refresh";
import { isFailure } from "@/lib/result";

/**
 * The one trigger for the `/demo` refresh (spec 0021, AC-17, AC-18).
 *
 * THIS IS THE FIRST ROUTE HANDLER UNDER `src/app/api/` IN THIS PROJECT, AND THE
 * FIRST ONE THAT WRITES ANYTHING, so the scope question is answered here as
 * well as in the spec, to set the precedent correctly for whichever feature is
 * the second.
 *
 * Root `AGENTS.md` says two things that both sound like they cover this and
 * neither of which was written with it in mind. "Route handlers under
 * `src/app/api/` may not read or write user data": `demo_result` and
 * `demo_refresh` are classified in the legal registry as holding no personal
 * data at all, so there is no user data here to read or write. "Server
 * Components read, Server Actions write": that rule is elaborated in the same
 * breath as being about the request path, that "no Supabase call and no session
 * check runs in the browser", and nothing here runs in a browser. A Server
 * Action structurally could not serve this caller anyway: it requires Next's
 * own internal dispatch, not a plain HTTP request an external trigger, or a
 * future cron, can make.
 *
 * WHAT THE RULES ARE ACTUALLY PROTECTING IS INTACT. Authorisation is decided
 * here, in the handler itself, not in the proxy. The write goes through one
 * `security invoker` Postgres function over two tables carrying row level
 * security forced with zero policies. No visitor's browser can reach this
 * route, because reaching it requires a secret only the engineer holds.
 *
 * NO SESSION IS READ HERE AND NONE IS ACCEPTED. A signed in visitor with a
 * valid session gets exactly the same refusal as a signed out one. The only
 * credential this route recognises is the shared secret, and the session the
 * refresh runs under is minted inside it for its own dedicated identity, never
 * inherited from whoever called.
 */

/**
 * The shared secret comparison (AC-18).
 *
 * BOTH SIDES ARE HASHED FIRST, AND THAT IS NOT DECORATION. `timingSafeEqual`
 * throws outright when the two buffers differ in length, so comparing the raw
 * strings would turn "wrong length" into a thrown 500 while "right length,
 * wrong value" returned a clean 401, which tells an attacker the secret's
 * length for free. Two SHA-256 digests are always 32 bytes, so the comparison
 * is constant time and total, and the length of the supplied value leaks
 * nothing.
 */
function secretMatches(supplied: string): boolean {
  const digest = (value: string) =>
    createHash("sha256").update(value, "utf8").digest();

  return timingSafeEqual(digest(supplied), digest(env.DEMO_REFRESH_SECRET));
}

/**
 * Runs one refresh, or says why it did not.
 *
 * THE THREE OUTCOMES GET THREE DIFFERENT STATUSES, because they are three
 * different facts and whoever triggers this (today a person, later a
 * scheduler) has to be able to tell them apart without reading prose. A gate
 * refusal is not a server error: the budget declined, deliberately, and the
 * previous data is still serving correctly.
 */
export async function POST(request: Request): Promise<Response> {
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : undefined;

  /**
   * REFUSED BEFORE ANYTHING IS SPENT (AC-18). No Adzuna call, no model call and
   * no session mint happens above this line, so a wrong secret costs nothing
   * but the comparison.
   */
  if (supplied === undefined || !secretMatches(supplied)) {
    return Response.json(
      { refreshed: false, reason: "A valid refresh secret is required." },
      { status: 401 },
    );
  }

  const outcome = await refreshDemoResults();

  if (isFailure(outcome)) {
    /**
     * The failure is already reported to Sentry by `failure()` at the point it
     * happened, so nothing is reported again here. Its `message` is written to
     * be safe to show, which is what makes returning it honest rather than
     * leaking: no secret and no raw record ever goes into one.
     */
    return Response.json(
      { refreshed: false, reason: outcome.message },
      { status: 500 },
    );
  }

  if (!outcome.value.completed) {
    return Response.json(
      {
        refreshed: false,
        reason: `The usage gate refused this refresh: ${outcome.value.reason}. Nothing was written and the previous results are unchanged.`,
      },
      { status: 503 },
    );
  }

  return Response.json({
    refreshed: true,
    listings: outcome.value.listingCount,
    rows: outcome.value.rowCount,
  });
}
