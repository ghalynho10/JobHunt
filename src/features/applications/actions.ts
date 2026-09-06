"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";

import {
  attempt,
  failure,
  isFailure,
  success,
  type Result,
} from "@/lib/result";
import { readOnlyCookieAdapter } from "@/lib/supabase/read-only-cookies";
import { createClient } from "@/lib/supabase/server";

import { PROFILE_LINK_TEXT } from "./copy";
import {
  APPLICATION_FAILURES,
  CHECK_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  UNIQUE_VIOLATION,
} from "./failures";
import {
  APPLIED_STATE,
  failedState,
  type ApplicationActionState,
} from "./form-state";
import { listingSnapshotSchema, predictedFlagFor } from "./schemas";

/**
 * The two application write paths (spec 0014, `## Feature design`, API surface).
 *
 * BOTH OPEN THEIR NAMED SPAN AS THE FIRST STATEMENT (binding rule 4), before
 * the caller check and before any parse. A span opened after a guard clause
 * would mean a total refusal outage produced no spans at all, so the failure
 * ratio would have no denominator and the alert would stay silent through
 * exactly the outage it exists to catch. Both names are registered in
 * `docs/observability/spans.md`.
 *
 * BOTH VERIFY THEIR OWN CALLER (binding rule 6), independently of the protected
 * layout that rendered the control. A Server Action is a callable endpoint
 * whatever page renders it, so the page's own session check protects the page
 * and nothing else. Row level security is the real guarantee behind both.
 *
 * THEY END DIFFERENTLY, AND THE ASYMMETRY IS THE WHOLE DESIGN. `remove` follows
 * the house pattern and calls `revalidatePath`. `record` calls NOTHING that
 * re-renders. See each one's own header.
 */

/** Where the applications list lives, and the only path this feature revalidates. */
const APPLICATIONS_PATH = "/applications";

/**
 * The caller's own id, verified inside the action.
 *
 * BINDING RULE 5: `getClaims()` reaches Supabase's JWKS endpoint and can throw,
 * which is a different thing from the returned `error` that means an invalid,
 * expired or absent session. Only the latter is an everyday outcome.
 *
 * The id comes from verified claims rather than from the form, so no client
 * supplied value can ever name whose row is being written (spec 0014,
 * invariant 8).
 */
async function callerId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Result<string>> {
  const attempted = await attempt(
    {
      kind: "external_service_failed",
      message: "Could not verify the session.",
    },
    () => supabase.auth.getClaims(),
  );

  if (isFailure(attempted)) return attempted;

  const { data, error } = attempted.value;

  if (error || !data) {
    return failure({
      kind: APPLICATION_FAILURES.session_missing.kind,
      severity: APPLICATION_FAILURES.session_missing.severity,
      message: APPLICATION_FAILURES.session_missing.message,
    });
  }

  return success(data.claims.sub);
}

/** A driver error this feature's own checks did not anticipate. */
function databaseFailure(error: { code?: string; message: string }) {
  return failure({
    kind: APPLICATION_FAILURES.database_unavailable.kind,
    severity: APPLICATION_FAILURES.database_unavailable.severity,
    message: APPLICATION_FAILURES.database_unavailable.message,
    context: { code: error.code },
    cause: error,
  });
}

/**
 * Records that the caller applied to one listing (spec 0014, AC-1 to AC-6).
 *
 * IT CALLS NOTHING THAT RE-RENDERS THE PAGE IT WAS INVOKED FROM, and that is
 * load bearing rather than stylistic. Per the installed Next.js 16.3.1 docs
 * (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md:44-48` and
 * `:74`), exactly five things put a re-render of the current route into an
 * action's response: `revalidatePath`, `updateTag`, `refresh`, `redirect`, and
 * a cookie mutation. This action performs none of them:
 *
 *   1 to 4: it returns an `ApplicationActionState` and calls no such function.
 *   5: it builds its client with `readOnlyCookieAdapter()`, so a session
 *      refresh during the caller check cannot write a cookie (AC-20).
 *
 * WHY IT MATTERS. This runs from `/search`, and a re-render there re-runs
 * `searchListings()`, spending one of the 25 Adzuna calls an account gets per
 * week (spec 0011). Every profile action in this codebase ends with
 * `revalidatePath` then `redirect`, so the house pattern is the tempting thing
 * to copy here, and copying it would make every apply cost a search. A later
 * session tidying this toward that pattern would reintroduce the cost with
 * nothing failing. Do not add any of the five.
 *
 * THE LISTING ARRIVES THROUGH AN ENCRYPTED CLOSURE, NOT A FORM FIELD. The card
 * defines an inline `'use server'` function capturing its own parsed `Listing`
 * and delegating here, so Next encrypts the value with a per build key and the
 * browser can neither read nor forge one (`data-security.md:526`). It is parsed
 * again on arrival regardless, per `AGENTS.md`'s "Parse at every boundary" rule
 * and because those same docs advise against relying on the encryption alone.
 */
export async function recordApplication(
  listing: unknown,
): Promise<ApplicationActionState> {
  return Sentry.startSpan(
    { name: "application.record", op: "db.query" },
    async (): Promise<ApplicationActionState> => {
      /** AC-20: read only, so nothing here can trigger a re-render. */
      const supabase = await createClient(await readOnlyCookieAdapter());

      const caller = await callerId(supabase);

      if (isFailure(caller)) return failedState(caller.message);

      const parsed = listingSnapshotSchema.safeParse(listing);

      if (!parsed.success) {
        const rejected = failure({
          kind: APPLICATION_FAILURES.listing_rejected.kind,
          severity: APPLICATION_FAILURES.listing_rejected.severity,
          message: APPLICATION_FAILURES.listing_rejected.message,
          context: { issues: parsed.error.issues.map((issue) => issue.path) },
        });

        return failedState(rejected.message);
      }

      const snapshot = parsed.data;

      const attempted = await attempt(
        {
          kind: APPLICATION_FAILURES.database_unavailable.kind,
          message: APPLICATION_FAILURES.database_unavailable.message,
        },
        async () =>
          await supabase.from("application").insert({
            /** From verified claims, never from the listing. */
            profile_id: caller.value,
            source: snapshot.source,
            source_job_id: snapshot.sourceJobId,
            job_title: snapshot.title,
            company_name: snapshot.companyName,
            job_location: snapshot.location ?? null,
            job_url: snapshot.url,
            /**
             * A SNIPPET, NOT THE FULL POSTING (AC-12). Adzuna's search response
             * carries no full text, confirmed against its API docs on
             * 2026-09-04. Spec 0003 describes this column as the full
             * description in two places and both are wrong; the correction is
             * spec 0014's first Follow-up item.
             */
            job_description: snapshot.descriptionSnippet ?? null,
            salary_min: snapshot.salaryMin ?? null,
            salary_max: snapshot.salaryMax ?? null,
            salary_currency: snapshot.salaryCurrency ?? null,
            /** Null, not false, when no pay was stated at all (AC-6). */
            salary_is_predicted: predictedFlagFor(snapshot),
            posted_at: snapshot.postedAt ?? null,
            /**
             * `applied_at`, `created_at` and `updated_at` are deliberately
             * absent: the database owns all three (spec 0003, invariant 10).
             */
          }),
      );

      if (isFailure(attempted)) return failedState(attempted.message);

      const { error } = attempted.value;

      if (error)
        return failedState(insertFailure(error).message, actionFor(error));

      return APPLIED_STATE;
    },
  );
}

/**
 * One insert error, classified into the situation it actually is.
 *
 * WITHOUT THIS EVERY ONE WOULD BE `database_unavailable`, which would file two
 * ordinary caller outcomes as outages and put them into binding rule 4's alert
 * numerator. Spec 0003 AC-7 and AC-8 both put the guarantee in the database on
 * purpose, so it holds for a caller that never checked; this is the other half
 * of that bargain, turning each refusal into something a reader can act on.
 */
function insertFailure(error: { code?: string; message: string }) {
  if (error.code === UNIQUE_VIOLATION) {
    return failure({
      kind: APPLICATION_FAILURES.already_applied.kind,
      severity: APPLICATION_FAILURES.already_applied.severity,
      message: APPLICATION_FAILURES.already_applied.message,
      context: { code: error.code },
    });
  }

  if (error.code === FOREIGN_KEY_VIOLATION) {
    return failure({
      kind: APPLICATION_FAILURES.profile_missing.kind,
      severity: APPLICATION_FAILURES.profile_missing.severity,
      message: APPLICATION_FAILURES.profile_missing.message,
      context: { code: error.code },
    });
  }

  if (error.code === CHECK_VIOLATION) {
    return failure({
      kind: APPLICATION_FAILURES.listing_rejected.kind,
      severity: APPLICATION_FAILURES.listing_rejected.severity,
      message: APPLICATION_FAILURES.listing_rejected.message,
      context: { code: error.code },
    });
  }

  return databaseFailure(error);
}

/** `COPY-3` is the one message with somewhere for the reader to go (AC-5). */
function actionFor(error: { code?: string }) {
  return error.code === FOREIGN_KEY_VIOLATION
    ? { href: "/profile", label: PROFILE_LINK_TEXT }
    : undefined;
}

/**
 * Removes one recorded application (spec 0014, AC-11).
 *
 * IT DOES REVALIDATE, unlike `recordApplication` above, and the asymmetry is
 * deliberate rather than an oversight. `/applications` makes no outbound call,
 * so re-rendering it costs nothing; the whole reason the apply refuses to
 * re-render is that `/search` spends an Adzuna call when it does. Without this
 * the reader would submit the removal and watch the row stay on screen.
 *
 * A REMOVAL THAT MATCHED NOTHING IS A REPORTED FAILURE, never a quiet success.
 * `.select()` is what makes that visible: without it the driver reports no
 * error for a delete that touched zero rows, and a request to remove somebody
 * else's row (refused by row level security) would look exactly like success.
 */
export async function removeApplication(
  _previous: ApplicationActionState,
  formData: FormData,
): Promise<ApplicationActionState> {
  return Sentry.startSpan(
    { name: "application.remove", op: "db.query" },
    async (): Promise<ApplicationActionState> => {
      const supabase = await createClient();

      const caller = await callerId(supabase);

      if (isFailure(caller)) return failedState(caller.message);

      const id = formData.get("application_id");

      if (typeof id !== "string" || id.length === 0) {
        return failedState(APPLICATION_FAILURES.application_missing.message);
      }

      const attempted = await attempt(
        {
          kind: APPLICATION_FAILURES.database_unavailable.kind,
          message: APPLICATION_FAILURES.database_unavailable.message,
        },
        async () =>
          await supabase
            .from("application")
            .delete()
            /**
             * NARROWED BY THE CALLER'S OWN ID IN THE STATEMENT, in addition to
             * the row level security policy that already restricts it. Belt and
             * braces on purpose: a crafted id cannot reach another user's row
             * even if a policy were ever loosened by mistake.
             */
            .eq("id", id)
            .eq("profile_id", caller.value)
            .select("id"),
      );

      if (isFailure(attempted)) return failedState(attempted.message);

      const { data, error } = attempted.value;

      if (error) return failedState(databaseFailure(error).message);

      if (data === null || data.length === 0) {
        const missing = failure({
          kind: APPLICATION_FAILURES.application_missing.kind,
          severity: APPLICATION_FAILURES.application_missing.severity,
          message: APPLICATION_FAILURES.application_missing.message,
        });

        return failedState(missing.message);
      }

      revalidatePath(APPLICATIONS_PATH);

      return APPLIED_STATE;
    },
  );
}
