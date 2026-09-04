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
 * The prefill `/search` reads from the caller's own `job_preference` row
 * (spec 0013, AC-9). Landing on a bare `/search` never itself runs a search
 * or spends gate budget, so this is a plain read, separate from
 * `searchListings()` entirely.
 */

export interface SearchPrefill {
  readonly title: string | undefined;
  readonly location: string | undefined;
}

const prefillRowSchema = z.object({
  desired_titles: z.array(z.string()),
  desired_locations: z.array(z.string()),
});

/**
 * The caller's first stated title and location, or both `undefined` when no
 * `job_preference` row exists, or its array is empty (AC-9). Not a failure
 * either way: an unset preference is an ordinary, early state, the same
 * reasoning `readProfileSections()`'s own `preferences: Preferences |
 * undefined` already carries.
 */
export async function readSearchPrefill(): Promise<Result<SearchPrefill>> {
  /** BINDING RULE 4: the named span opens as the first statement. */
  return Sentry.startSpan(
    { name: "search.read_prefill", op: "db.query" },
    async (): Promise<Result<SearchPrefill>> => {
      const supabase = await createClient();

      /** BINDING RULE 5: `getClaims()` can throw, distinct from a returned error. */
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
       * NO `eq` FILTER, the same reasoning as `readOwnProfile()`: the policy
       * is what confines this select to the caller's own row.
       */
      const attempted = await attempt(
        {
          kind: "database_unavailable",
          message: "Could not read search preferences.",
        },
        async () =>
          await supabase
            .from("job_preference")
            .select("desired_titles, desired_locations")
            .maybeSingle(),
      );

      if (isFailure(attempted)) return attempted;

      const { data, error } = attempted.value;

      if (error) {
        return failure({
          kind: "database_unavailable",
          severity: "unexpected",
          message: "Could not read search preferences.",
          context: { code: error.code, hint: error.hint },
          cause: error,
        });
      }

      if (data === null) {
        return success({ title: undefined, location: undefined });
      }

      const parsed = prefillRowSchema.safeParse(data);

      if (!parsed.success) {
        return failure({
          kind: "response_malformed",
          severity: "unexpected",
          message:
            "The search preferences row did not match the shape we parse.",
          context: { issues: z.treeifyError(parsed.error) },
          cause: parsed.error,
        });
      }

      return success({
        title: parsed.data.desired_titles[0],
        location: parsed.data.desired_locations[0],
      });
    },
  );
}
