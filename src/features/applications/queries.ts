import "server-only";

import * as Sentry from "@sentry/nextjs";

import {
  attempt,
  failure,
  isFailure,
  success,
  type Result,
} from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

import { APPLICATION_FAILURES } from "./failures";

/**
 * The two application read paths (spec 0014, `## Feature design`, API surface).
 *
 * BOTH OPEN A NAMED SPAN AS THEIR FIRST STATEMENT (binding rule 4), and they
 * are deliberately two names rather than one. `application.read_list` runs on
 * `/applications` and `search.read_applied` runs on `/search`; folding them
 * together would put two pages' failure rates into one denominator, so an
 * outage on one would be diluted by healthy traffic on the other.
 *
 * NEITHER IS A ROUTE HANDLER and neither lives under `src/app/api/`, so binding
 * rule 6's restriction on handlers reading user data is respected rather than
 * worked around. Row level security is the guarantee: every policy on
 * `application` compares `(select auth.uid()) = profile_id`, so these read the
 * caller's own rows by construction and neither needs a `profile_id` filter to
 * be safe.
 */

/** One recorded application, as `/applications` renders it. */
export interface ApplicationRow {
  readonly id: string;
  readonly sourceJobId: string;
  readonly title: string;
  readonly companyName: string;
  readonly location: string | undefined;
  readonly url: string;
  readonly descriptionSnippet: string | undefined;
  readonly salaryMin: number | undefined;
  readonly salaryMax: number | undefined;
  readonly salaryCurrency: string | undefined;
  /** Null when the source quoted no pay at all, which is not "not predicted". */
  readonly salaryIsPredicted: boolean | undefined;
  readonly postedAt: string | undefined;
  readonly appliedAt: string;
}

/** `null` in the database becomes `undefined` here (`AGENTS.md`: prefer `undefined`). */
const optional = <T>(value: T | null): T | undefined => value ?? undefined;

/**
 * The caller's own applications, newest applied first (AC-3, AC-18).
 *
 * ORDERED BY `applied_at`, NOT `created_at`. Spec 0003 defined the two columns
 * separately so a later feature can record an application made elsewhere
 * without lying about when the row was written; ordering by the write time
 * would put such a row in the wrong place the day that feature ships.
 *
 * NOT PAGINATED, which is correct at a ceiling of 25 searches a week and wrong
 * eventually. Recorded in spec 0014's Consequences and inherited by feature 23.
 */
export async function readApplications(): Promise<Result<ApplicationRow[]>> {
  return Sentry.startSpan(
    { name: "application.read_list", op: "db.query" },
    async (): Promise<Result<ApplicationRow[]>> => {
      const supabase = await createClient();

      const attempted = await attempt(
        {
          kind: APPLICATION_FAILURES.database_unavailable.kind,
          message: APPLICATION_FAILURES.database_unavailable.message,
        },
        async () =>
          await supabase
            .from("application")
            .select(
              "id, source_job_id, job_title, company_name, job_location, job_url, job_description, salary_min, salary_max, salary_currency, salary_is_predicted, posted_at, applied_at",
            )
            .order("applied_at", { ascending: false }),
      );

      if (isFailure(attempted)) return attempted;

      const { data, error } = attempted.value;

      if (error) {
        return failure({
          kind: APPLICATION_FAILURES.database_unavailable.kind,
          severity: APPLICATION_FAILURES.database_unavailable.severity,
          message: APPLICATION_FAILURES.database_unavailable.message,
          context: { code: error.code },
          cause: error,
        });
      }

      return success(
        (data ?? []).map((row) => ({
          id: row.id,
          sourceJobId: row.source_job_id,
          title: row.job_title,
          companyName: row.company_name,
          location: optional(row.job_location),
          url: row.job_url,
          descriptionSnippet: optional(row.job_description),
          /**
           * `numeric` columns arrive as strings from PostgREST, so both pay
           * figures are coerced here rather than rendered raw. Stored raw,
           * formatted at render (`AGENTS.md`), and this is the render side.
           */
          salaryMin: numeric(row.salary_min),
          salaryMax: numeric(row.salary_max),
          salaryCurrency: optional(row.salary_currency),
          salaryIsPredicted: optional(row.salary_is_predicted),
          postedAt: optional(row.posted_at),
          appliedAt: row.applied_at,
        })),
      );
    },
  );
}

/**
 * A `numeric` column as a number, or `undefined`.
 *
 * PostgREST sends `numeric` as a string to avoid the precision loss a JSON
 * number would cause. The generated types say `number`, which is the one place
 * they are optimistic, so this handles both rather than trusting either.
 */
function numeric(value: number | string | null): number | undefined {
  if (value === null) return undefined;

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Which of the listings on screen the caller has already applied to (AC-9).
 *
 * SCOPED TO THE IDS ACTUALLY RENDERED, not the caller's whole history. The page
 * needs to mark at most twenty cards, so asking about twenty ids keeps the read
 * flat as the archive grows.
 *
 * A FAILURE IS RETURNED, NEVER SWALLOWED. Rendering every card unmarked when
 * this read fails would silently claim the reader has applied to none of them,
 * which is the default that reads like success `AGENTS.md` forbids. The page
 * says so out loud instead (`COPY-8`).
 */
export async function readAppliedJobIds(
  sourceJobIds: readonly string[],
): Promise<Result<ReadonlySet<string>>> {
  return Sentry.startSpan(
    { name: "search.read_applied", op: "db.query" },
    async (): Promise<Result<ReadonlySet<string>>> => {
      /**
       * An empty page of results asks nothing, and the span still opened above
       * so binding rule 4's denominator counts this render either way.
       */
      if (sourceJobIds.length === 0) return success(new Set<string>());

      const supabase = await createClient();

      const attempted = await attempt(
        {
          kind: APPLICATION_FAILURES.database_unavailable.kind,
          message: APPLICATION_FAILURES.database_unavailable.message,
        },
        async () =>
          await supabase
            .from("application")
            .select("source_job_id")
            .in("source_job_id", [...sourceJobIds]),
      );

      if (isFailure(attempted)) return attempted;

      const { data, error } = attempted.value;

      if (error) {
        return failure({
          kind: APPLICATION_FAILURES.database_unavailable.kind,
          severity: APPLICATION_FAILURES.database_unavailable.severity,
          message: APPLICATION_FAILURES.database_unavailable.message,
          context: { code: error.code },
          cause: error,
        });
      }

      return success(new Set((data ?? []).map((row) => row.source_job_id)));
    },
  );
}
