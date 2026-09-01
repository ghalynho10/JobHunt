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
 * This is the deployed end to end proof. It proves six things connect at once
 * (the framework, the client, the session, row level security, the deployment,
 * the error path), against a real product table. It took that job over from a
 * throwaway scaffold read, which is why the proof never went dark when the
 * scaffold was removed.
 */

/**
 * Binding rule from spec 0001: nothing untrusted enters the application
 * unparsed. The row is parsed rather than type asserted, because a wrong
 * declared type is exactly what the compiler cannot catch (AC-15).
 *
 * `z.uuid()`, TIGHTENED FROM `z.guid()` BY SPEC 0004 (AC-6). `profile.id` is the
 * auth user id, and the two synthetic users used to carry ids whose RFC version
 * and variant nibbles were wrong (`1111-1111-…`, `2222-2222-…`). Postgres stored
 * them happily and `z.uuid()` would have refused them, rendering
 * `response_malformed` on the deployed page for exactly the fixtures AC-14 is
 * proved against, so this had to stay at the looser `z.guid()` until the pool
 * was re-minted. Feature 8 re-minted it, so this now checks the version and
 * variant nibbles too and a malformed id can no longer reach the application
 * unnoticed. `test/integration/fixtures.test.ts` holds the pool to the same
 * standard, against the real rows, so the two can never drift apart again.
 */
const profileSchema = z.object({
  id: z.uuid(),
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

/**
 * The caller's own profile, as it exists AFTER the parse above.
 *
 * INFERRED FROM THE SCHEMA RATHER THAN WRITTEN OUT, and that is the load
 * bearing part. A hand written shape can drift from what is actually parsed,
 * and a wrong declared type is precisely what no strictness flag disagrees
 * with: it is the shape of the reference project's anchor bug that spec 0001
 * names, and the reason spec 0003 AC-15 asks for a parse at the boundary rather
 * than a type assertion. Inferring it means this type cannot disagree with the
 * parse that produces it.
 *
 * Being the output side of the transform, `location` and `summary` are
 * `string | undefined` here and never `null`, so a caller handles one kind of
 * absent rather than two.
 */
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

/**
 * Whether the caller has a profile row at all (spec 0008, AC-7, AC-7a).
 *
 * A SEPARATE READ FROM `readOwnProfile()` ON PURPOSE, and the separation is the
 * whole point of the criterion. `readOwnProfile()` treats an absent row as
 * `record_not_found`, an EXPECTED failure that still reports to Sentry and still
 * marks the `profile.read` span failed. That is right for a page whose job is to
 * show the profile, and wrong here: a first time sign in has no row by
 * definition, so reusing it would put the most ordinary event in the product
 * into the failure ratio feature 9 will alert on.
 *
 * SO AN ABSENT ROW RETURNS `false` AND BUILDS NO `failure()`. Nothing is being
 * hidden: an absent row is not a failure, it is the answer.
 *
 * A GENUINE QUERY ERROR IS STILL A FAILURE (AC-7a). The narrow exemption above
 * is for the absent row and nothing else. Collapsing an error into `false` would
 * land a visitor on `/profile` during a database outage as though their profile
 * were merely empty, which is exactly the default that reads like success the
 * error model forbids.
 *
 * IT OPENS NO SPAN OF ITS OWN, deliberately. It is only ever called inside
 * `landing_rule.decide`, so its failures already have a denominator there.
 * Reusing `profile.read` would merge two operations under one name and undo what
 * this function exists for.
 *
 * THE `eq` FILTER IS PRESENT HERE AND ABSENT IN `readOwnProfile()`, which is a
 * real difference and not an oversight. That read proves the policy works, so an
 * application side filter would make it look correct even if the policy were
 * broken. This one is called from route handlers deciding where to send a
 * visitor whose id the caller has already resolved from verified claims, so
 * naming the row makes the subject of the read explicit rather than ambient.
 * Row level security still confines it either way.
 *
 * @param userId The caller's own id, from claims that have already been verified.
 * @returns `true` when a row exists, `false` when none does, or a failure.
 */
export async function hasProfileRow(userId: string): Promise<Result<boolean>> {
  const supabase = await createClient();

  /** BINDING RULE 5: the database driver may throw rather than return. */
  const attempted = await attempt(
    {
      kind: "database_unavailable",
      message: "Could not check whether a profile exists.",
    },
    /**
     * `async` so the awaited value is the response rather than the builder:
     * PostgREST's builder is a thenable, not a `Promise`, so returning it raw
     * would not satisfy `attempt()`'s contract and its rejection would escape.
     */
    async () =>
      await supabase
        .from("profile")
        .select("id")
        .eq("id", userId)
        .maybeSingle(),
  );

  if (isFailure(attempted)) return attempted;

  const { data, error } = attempted.value;

  if (error) {
    return failure({
      kind: "database_unavailable",
      severity: "unexpected",
      message: "Could not check whether a profile exists.",
      context: { code: error.code, hint: error.hint },
      cause: error,
    });
  }

  /** No row is an answer, not a failure. This is AC-7's exemption, in one line. */
  return success(data !== null);
}
