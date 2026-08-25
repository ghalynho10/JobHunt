import "server-only";

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import {
  attempt,
  failure,
  isFailure,
  success,
  type Result,
} from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

/**
 * Spec 0003: the caller's own profile, read through the real server client under
 * a real policy.
 *
 * This is the read that replaces `readScaffoldCheck()` as the deployed end to
 * end proof. It proves the same six things connect (the framework, the client,
 * the session, row level security, the deployment, the error path), but against
 * a real product table rather than a scaffold one, so the proof survives the
 * removal of the scaffold instead of going dark until feature 9.
 */

/**
 * Binding rule from spec 0001: nothing untrusted enters the application
 * unparsed. The row is parsed rather than type asserted, because a wrong
 * declared type is exactly what the compiler cannot catch (AC-15).
 *
 * `z.guid()` AND NOT `z.uuid()`, DELIBERATELY. `profile.id` is the auth user id,
 * and the two synthetic users on the hosted development project carry ids whose
 * RFC version and variant nibbles are wrong (`1111…`, `2222…`). Postgres stores
 * them happily; `z.uuid()` checks those nibbles and would refuse them, which
 * would render `response_malformed` on the deployed page for exactly the
 * fixtures AC-14 is proved against. `z.guid()` checks the real 8-4-4-4-12 shape
 * and still refuses anything that is not an identifier. `supabase/seed.sql`
 * records why those two ids cannot simply be changed, and spec 0003's follow-up
 * gives feature 8 the job of minting valid ones; this line tightens to
 * `z.uuid()` on the day it does.
 */
const profileSchema = z.object({
  id: z.guid(),
  full_name: z.string().min(1),
  /**
   * Both are nullable columns, and both are mapped to `undefined` here rather
   * than carried as `null`, per the project rule preferring `undefined` in a
   * union. The mapping happens once, at the boundary, so nothing downstream has
   * to handle two kinds of absent.
   */
  location: z
    .string()
    .nullable()
    .transform((value) => value ?? undefined),
  summary: z
    .string()
    .nullable()
    .transform((value) => value ?? undefined),
});

export type Profile = z.infer<typeof profileSchema>;

/**
 * Reads the signed in caller's own profile.
 *
 * Returns `record_not_found` as an EXPECTED failure when the caller has no
 * profile row yet, which is an ordinary state before feature 9 builds the form
 * that creates one. It is a visible failure rather than an empty render,
 * because an empty render is indistinguishable from success with nothing to
 * show (AC-14).
 */
export async function readOwnProfile(): Promise<Result<Profile>> {
  /**
   * BINDING RULE 4: the named span opens as the FIRST statement of the
   * operation, before any early return or guard clause. If it opened later, a
   * total failure would produce no spans, the failure ratio would have no
   * denominator, and the alert would stay silent through exactly the outage it
   * exists to catch. The name is registered in `docs/observability/spans.md`.
   */
  return Sentry.startSpan(
    { name: "profile.read", op: "db.query" },
    async (): Promise<Result<Profile>> => {
      const supabase = await createClient();

      /**
       * The protected layout's redirect only changes the response it sends;
       * this page still renders concurrently underneath it, so an
       * unauthenticated request reaches this call regardless. Verifying the
       * caller here, the same guarantee every Server Action already carries
       * per binding rule 6, stops the pointless read and reports the outcome
       * as the expected thing it is rather than as `database_unavailable`.
       *
       * BINDING RULE 5: `getClaims()` reaches out to Supabase's JWKS endpoint
       * and can throw on a genuine service failure, distinct from the
       * returned `error`, which means an invalid, expired, or absent session.
       * Only the latter is an expected, everyday outcome.
       */
      const claimsAttempt = await attempt(
        {
          kind: "external_service_failed",
          message: "Could not verify the session.",
        },
        () => supabase.auth.getClaims(),
      );

      if (isFailure(claimsAttempt)) return claimsAttempt;

      const { data: claims, error: claimsError } = claimsAttempt.value;

      if (claimsError || !claims) {
        return failure({
          kind: "session_missing",
          severity: "expected",
          message: "No session is present for this read.",
        });
      }

      /**
       * NO `eq` FILTER ON THE CALLER'S ID, AND THAT IS THE POINT. The policy is
       * what confines this select to the caller's own row (spec 0003, Value
       * sourcing: "selected by policy"). Adding an application side filter
       * would make this read look correct even if the policy were broken, and
       * silently remove the thing AC-3 exists to prove.
       */
      const { data, error } = await supabase
        .from("profile")
        .select("id, full_name, location, summary")
        .maybeSingle();

      if (error) {
        return failure({
          kind: "database_unavailable",
          severity: "unexpected",
          message: "Could not reach the database.",
          context: { code: error.code, hint: error.hint },
          cause: error,
        });
      }

      if (data === null) {
        /**
         * Expected, not broken: row level security returns no rows rather than
         * an error when a policy does not match, and a signed in user with no
         * profile yet is an ordinary state until feature 9. Saying so out loud
         * is the point, and AC-14 requires this exact path to be visible.
         */
        return failure({
          kind: "record_not_found",
          severity: "expected",
          message: "No profile exists for this user yet.",
        });
      }

      const parsed = profileSchema.safeParse(data);

      if (!parsed.success) {
        return failure({
          kind: "response_malformed",
          severity: "unexpected",
          message: "The profile row did not match the shape we parse.",
          context: { issues: z.treeifyError(parsed.error) },
          cause: parsed.error,
        });
      }

      return success(parsed.data);
    },
  );
}
