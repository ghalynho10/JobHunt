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
 * The end to end thread from spec 0001's follow-up: read one row from Supabase
 * through the real server client, under a real policy, with a real session.
 *
 * It exists to prove the framework, the client, the session, the policy, the
 * deployment and the error path all connect. Feature 4 replaces this table with
 * the real data model; this query goes away with it.
 */

/**
 * Binding rule from the spec: nothing untrusted enters the application unparsed.
 * The row is parsed rather than type asserted, because a wrong declared type is
 * exactly what the compiler cannot catch. This is the runtime guarantee.
 */
const scaffoldCheckSchema = z.object({
  id: z.uuid(),
  note: z.string().min(1),
  created_at: z.iso.datetime({ offset: true }),
});

export type ScaffoldCheck = z.infer<typeof scaffoldCheckSchema>;

export async function readScaffoldCheck(): Promise<Result<ScaffoldCheck>> {
  /**
   * BINDING RULE 4: the named span opens as the FIRST statement of the
   * operation, before any early return or guard clause. If it opened later, a
   * total failure would produce no spans, the failure ratio would have no
   * denominator, and the alert would stay silent through exactly the outage it
   * exists to catch. The name is registered in `docs/observability/spans.md`.
   */
  return Sentry.startSpan(
    { name: "scaffold_check.read", op: "db.query" },
    async (): Promise<Result<ScaffoldCheck>> => {
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

      const { data, error } = await supabase
        .from("scaffold_check")
        .select("id, note, created_at")
        .limit(1)
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
         * an error when a policy does not match. Saying so out loud is the
         * point. A silent empty render here would look exactly like success,
         * which is the failure mode the spec's whole error model exists for.
         */
        return failure({
          kind: "record_not_found",
          severity: "expected",
          message: "No row is visible to this user.",
        });
      }

      const parsed = scaffoldCheckSchema.safeParse(data);

      if (!parsed.success) {
        return failure({
          kind: "response_malformed",
          severity: "unexpected",
          message: "The row did not match the shape we parse.",
          context: { issues: z.treeifyError(parsed.error) },
          cause: parsed.error,
        });
      }

      return success(parsed.data);
    },
  );
}
