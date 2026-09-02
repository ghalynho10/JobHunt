"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  attempt,
  failure,
  isFailure,
  success,
  type Failure,
  type Result,
} from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

import { currentMonth, firstOfMonth } from "./calendar";
import {
  FOREIGN_KEY_VIOLATION,
  PROFILE_FAILURES,
  UNIQUE_VIOLATION,
} from "./failures";
import {
  failedState,
  failedStateWithMessage,
  type ActionState,
} from "./form-state";
import {
  entryIdSchema,
  identitySchema,
  preferencesSchema,
  skillsSchema,
  workExperienceSchema,
} from "./schemas";

/**
 * The six profile write paths (spec 0010, `## Feature design`, API surface).
 *
 * EVERY ONE OPENS ITS NAMED SPAN AS ITS FIRST STATEMENT (binding rule 3), before
 * the caller check and before any parse. A span opened after a guard clause
 * would mean a total refusal outage produced no spans at all, so the failure
 * ratio would have no denominator and the alert would stay silent through
 * exactly the outage it exists to catch. The names are registered in
 * `docs/observability/spans.md`.
 *
 * EVERY ONE VERIFIES ITS OWN CALLER (binding rule 6), independently of the
 * protected layout that rendered the form. A Server Action is a callable
 * endpoint whatever page renders it, so the page's own session check protects
 * the page and nothing else.
 *
 * EVERY ONE CALLS `revalidatePath("/profile")` INSIDE THE SPAN AND
 * `redirect("/profile")` OUTSIDE IT. `redirect()` works by throwing, so a call
 * inside the span, or inside `attempt()`, would be recorded as the operation
 * failing at the moment it succeeded. That is the pattern
 * `src/features/auth/actions.ts` already follows.
 *
 * NOTHING IS RETURNED ON SUCCESS. Each action either ends in that redirect or
 * returns an `ActionState` the form renders, which is why the helpers below all
 * hand back `ActionState | undefined`: `undefined` means the write landed.
 */

/** Every action returns here, so a save is never read from a stale render. */
const PROFILE_PATH = "/profile";

/**
 * The caller's own id, verified inside the action.
 *
 * BINDING RULE 5: `getClaims()` reaches Supabase's JWKS endpoint and can throw,
 * which is a different thing from the returned `error` that means an invalid,
 * expired or absent session. Only the latter is an everyday outcome.
 *
 * The id is used as `profile.id` and as `profile_id` on every child row, and it
 * comes from verified claims rather than from the form, so no client supplied
 * value can ever name whose row is being written (invariant 1).
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
      kind: PROFILE_FAILURES.session_missing.kind,
      severity: PROFILE_FAILURES.session_missing.severity,
      message: PROFILE_FAILURES.session_missing.message,
    });
  }

  return success(data.claims.sub);
}

/**
 * Whether the caller already has a profile row, checked before a section write.
 *
 * A DEFENCE, NOT AN EXPECTED PATH (AC-1 renders no control for these sections
 * before the row exists). It is here because a Server Action is reachable
 * without the page, and because the alternative for `saveSkills` and
 * `savePreferences` would be a foreign key violation surfacing as
 * `database_unavailable`, which would file a caller error as an outage.
 */
async function requireProfileRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Result<true>> {
  const attempted = await attempt(
    {
      kind: PROFILE_FAILURES.database_unavailable.kind,
      message: PROFILE_FAILURES.database_unavailable.message,
    },
    async () => await supabase.from("profile").select("id").maybeSingle(),
  );

  if (isFailure(attempted)) return attempted;

  const { data, error } = attempted.value;

  if (error) return databaseFailure(error);

  if (data === null) {
    return failure({
      kind: PROFILE_FAILURES.profile_missing.kind,
      severity: PROFILE_FAILURES.profile_missing.severity,
      message: PROFILE_FAILURES.profile_missing.message,
    });
  }

  return success(true);
}

/**
 * A driver error this feature's own checks did not anticipate.
 *
 * It returns the `Failure` itself rather than a `Result`, because every caller
 * reads `.message` off it immediately to put a sentence in front of the reader.
 * A `Result<never>` would have to be narrowed first, which is a check with only
 * one possible answer.
 */
function databaseFailure(error: {
  readonly code?: string;
  readonly hint?: string | null;
  readonly message?: string;
}): Failure {
  return failure({
    kind: PROFILE_FAILURES.database_unavailable.kind,
    severity: PROFILE_FAILURES.database_unavailable.severity,
    message: PROFILE_FAILURES.database_unavailable.message,
    context: { code: error.code, hint: error.hint },
    cause: error,
  });
}

/**
 * Identity: create the profile row, or update it in place (AC-2, AC-3, AC-4).
 *
 * ALWAYS AN UPSERT ON `id`, NEVER A BRANCH BETWEEN INSERT AND UPDATE. The action
 * does not choose, so a repeated submission (a double click, a back button
 * resubmission) updates the same row rather than failing a second insert on the
 * primary key. That is what makes AC-4's "never as a second insert" true by
 * construction instead of by a check somebody has to keep correct.
 */
export async function saveIdentity(
  previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const outcome = await Sentry.startSpan(
    { name: "profile.save_identity", op: "db.query" },
    async (): Promise<ActionState | undefined> => {
      const supabase = await createClient();
      const caller = await callerId(supabase);

      if (isFailure(caller)) {
        return failedStateWithMessage(formData, caller.message);
      }

      const parsed = identitySchema.safeParse({
        full_name: formData.get("full_name") ?? "",
        location: formData.get("location") ?? "",
        summary: formData.get("summary") ?? "",
      });

      if (!parsed.success) {
        return failedState(
          formData,
          parsed.error,
          PROFILE_FAILURES.validation_failed.message,
        );
      }

      const attempted = await attempt(
        {
          kind: PROFILE_FAILURES.database_unavailable.kind,
          message: PROFILE_FAILURES.database_unavailable.message,
        },
        async () =>
          await supabase.from("profile").upsert(
            {
              /** Invariant 1: from verified claims, never from the form. */
              id: caller.value,
              full_name: parsed.data.full_name,
              /** Invariant 8: absent is `NULL`, never an empty string. */
              location: parsed.data.location ?? null,
              summary: parsed.data.summary ?? null,
            },
            { onConflict: "id" },
          ),
      );

      if (isFailure(attempted)) {
        return failedStateWithMessage(formData, attempted.message);
      }

      if (attempted.value.error) {
        const failed = databaseFailure(attempted.value.error);
        return failedStateWithMessage(formData, failed.message);
      }

      revalidatePath(PROFILE_PATH);
      return undefined;
    },
  );

  if (outcome !== undefined) return outcome;

  /** Outside the span: `redirect()` throws, and a throw inside reads as failure. */
  redirect(PROFILE_PATH);
}

/**
 * Skills: the diff based save (AC-5, AC-6).
 *
 * A READ, THEN AN INSERT, THEN A DELETE. Never a blanket delete followed by a
 * blanket insert: that would churn every row's `id` and `created_at` on every
 * save, and a failure between the two halves would leave the caller with no
 * skills at all.
 *
 * INSERTS RUN BEFORE DELETES (invariant 9). A failure between the two steps
 * leaves the caller with every skill they already had plus whatever new ones
 * landed, never fewer than they started with. The order is the whole protection,
 * so reversing it for tidiness would remove it.
 *
 * THE COMPARISON IGNORES CASE, matching the unique index on
 * `(profile_id, lower(name))` that is the authority on skill identity. A
 * submission that changes only capitalisation is therefore a no-op and the
 * stored casing stands (AC-5).
 */
export async function saveSkills(
  previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const outcome = await Sentry.startSpan(
    { name: "profile.save_skills", op: "db.query" },
    async (): Promise<ActionState | undefined> => {
      const supabase = await createClient();
      const caller = await callerId(supabase);

      if (isFailure(caller)) {
        return failedStateWithMessage(formData, caller.message);
      }

      const present = await requireProfileRow(supabase);

      if (isFailure(present)) {
        return failedStateWithMessage(formData, present.message);
      }

      const parsed = skillsSchema.safeParse({
        skills: formData.get("skills") ?? "",
      });

      if (!parsed.success) {
        return failedState(
          formData,
          parsed.error,
          PROFILE_FAILURES.validation_failed.message,
        );
      }

      const current = await attempt(
        {
          kind: PROFILE_FAILURES.database_unavailable.kind,
          message: PROFILE_FAILURES.database_unavailable.message,
        },
        async () => await supabase.from("profile_skill").select("name"),
      );

      if (isFailure(current)) {
        return failedStateWithMessage(formData, current.message);
      }

      if (current.value.error) {
        const failed = databaseFailure(current.value.error);
        return failedStateWithMessage(formData, failed.message);
      }

      const stored = (current.value.data ?? []).map((row) => row.name);
      const storedKeys = new Set(stored.map((name) => name.toLowerCase()));
      const submittedKeys = new Set(
        parsed.data.skills.map((name) => name.toLowerCase()),
      );

      const toInsert = parsed.data.skills.filter(
        (name) => !storedKeys.has(name.toLowerCase()),
      );
      const toDelete = stored.filter(
        (name) => !submittedKeys.has(name.toLowerCase()),
      );

      if (toInsert.length > 0) {
        const inserted = await attempt(
          {
            kind: PROFILE_FAILURES.database_unavailable.kind,
            message: PROFILE_FAILURES.database_unavailable.message,
          },
          async () =>
            await supabase.from("profile_skill").insert(
              toInsert.map((name) => ({
                /** Invariant 1: from verified claims, never from the form. */
                profile_id: caller.value,
                name,
              })),
            ),
        );

        if (isFailure(inserted)) {
          return failedStateWithMessage(formData, inserted.message);
        }

        const error = inserted.value.error;

        if (error) {
          /**
           * Invariant 2: the submitted list was already deduplicated ignoring
           * case, so the only way to collide is another tab writing the same
           * name first. That is a concurrency outcome, not an outage, so it is
           * `validation_failed` and never `database_unavailable`.
           */
          if (error.code === UNIQUE_VIOLATION) {
            const conflict = failure({
              kind: PROFILE_FAILURES.skill_conflict.kind,
              severity: PROFILE_FAILURES.skill_conflict.severity,
              message: PROFILE_FAILURES.skill_conflict.message,
              context: { code: error.code },
              cause: error,
            });

            return failedStateWithMessage(formData, conflict.message);
          }

          const failed = databaseFailure(error);
          return failedStateWithMessage(formData, failed.message);
        }
      }

      if (toDelete.length > 0) {
        const removed = await attempt(
          {
            kind: PROFILE_FAILURES.database_unavailable.kind,
            message: PROFILE_FAILURES.database_unavailable.message,
          },
          /**
           * NO ROW COUNT CHECK HERE, and invariant 4 says so in terms. A diff
           * computed delete that matches fewer rows than expected means another
           * tab already removed one of the same names, which is the benign last
           * write wins outcome the rest of this feature also accepts. Only a
           * single, entry addressed delete treats zero rows as a failure.
           */
          async () =>
            await supabase.from("profile_skill").delete().in("name", toDelete),
        );

        if (isFailure(removed)) {
          return failedStateWithMessage(formData, removed.message);
        }

        if (removed.value.error) {
          const failed = databaseFailure(removed.value.error);
          return failedStateWithMessage(formData, failed.message);
        }
      }

      revalidatePath(PROFILE_PATH);
      return undefined;
    },
  );

  if (outcome !== undefined) return outcome;

  redirect(PROFILE_PATH);
}

/**
 * A work history entry as the two tables' columns, built from the parsed form.
 *
 * The dates are constructed here rather than accepted: a month and a year
 * become the first day of that month (invariant 3), and an absent ended pair
 * becomes `NULL`, which is what says the role is current.
 */
function workExperienceColumns(
  values: ReturnType<ReturnType<typeof workExperienceSchema>["parse"]>,
) {
  return {
    company: values.company,
    title: values.title,
    /** Invariant 8: absent is `NULL`, never an empty string. */
    location: values.location ?? null,
    description: values.description ?? null,
    started_on: firstOfMonth({
      year: values.started_year,
      month: values.started_month,
    }),
    ended_on:
      values.ended_year === undefined || values.ended_month === undefined
        ? null
        : firstOfMonth({
            year: values.ended_year,
            month: values.ended_month,
          }),
  };
}

/** The form fields both work history actions parse, in one place. */
function workExperienceFields(formData: FormData) {
  return {
    company: formData.get("company") ?? "",
    title: formData.get("title") ?? "",
    location: formData.get("location") ?? "",
    description: formData.get("description") ?? "",
    started_month: formData.get("started_month") ?? "",
    started_year: formData.get("started_year") ?? "",
    ended_month: formData.get("ended_month") ?? "",
    ended_year: formData.get("ended_year") ?? "",
  };
}

/**
 * Work history: add one entry (AC-7, AC-7a).
 *
 * IT SHARES `profile.save_work_experience` WITH `updateWorkExperience`, told
 * apart by an `operation` attribute, the same way `auth.sign_in` carries a
 * `provider` attribute for two closely related calls. One name means one
 * denominator for binding rule 4's ratio rather than two half sized ones.
 *
 * THE TWO STAY SEPARATE ACTIONS ALL THE SAME, because their failure shapes
 * genuinely differ: an insert is refused outright by the insert policy's
 * `with check` if anything about it is wrong, while an update row level
 * security excludes affects zero rows and raises nothing at all. Collapsing
 * them into one function taking an optional id would move that distinction
 * inside a single body that has to get both branches right, to save one export.
 */
export async function addWorkExperience(
  previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const outcome = await Sentry.startSpan(
    {
      name: "profile.save_work_experience",
      op: "db.query",
      attributes: { operation: "insert" },
    },
    async (): Promise<ActionState | undefined> => {
      const supabase = await createClient();
      const caller = await callerId(supabase);

      if (isFailure(caller)) {
        return failedStateWithMessage(formData, caller.message);
      }

      const parsed = workExperienceSchema(currentMonth()).safeParse(
        workExperienceFields(formData),
      );

      if (!parsed.success) {
        return failedState(
          formData,
          parsed.error,
          PROFILE_FAILURES.validation_failed.message,
        );
      }

      const attempted = await attempt(
        {
          kind: PROFILE_FAILURES.database_unavailable.kind,
          message: PROFILE_FAILURES.database_unavailable.message,
        },
        async () =>
          await supabase.from("work_experience").insert({
            /** Invariant 1: from verified claims, never from the form. */
            profile_id: caller.value,
            ...workExperienceColumns(parsed.data),
          }),
      );

      if (isFailure(attempted)) {
        return failedStateWithMessage(formData, attempted.message);
      }

      const error = attempted.value.error;

      if (error) {
        /**
         * No profile row yet. The insert raises a foreign key violation rather
         * than returning zero rows, and the spec maps it here rather than
         * letting it fall through to `database_unavailable`, for the same
         * defensive reason `requireProfileRow` exists on the other two actions:
         * a caller error must not be filed as an outage.
         */
        if (error.code === FOREIGN_KEY_VIOLATION) {
          const missing = failure({
            kind: PROFILE_FAILURES.profile_missing.kind,
            severity: PROFILE_FAILURES.profile_missing.severity,
            message: PROFILE_FAILURES.profile_missing.message,
            context: { code: error.code },
            cause: error,
          });

          return failedStateWithMessage(formData, missing.message);
        }

        const failed = databaseFailure(error);
        return failedStateWithMessage(formData, failed.message);
      }

      revalidatePath(PROFILE_PATH);
      return undefined;
    },
  );

  if (outcome !== undefined) return outcome;

  redirect(PROFILE_PATH);
}

/**
 * Work history: edit one entry (AC-7, AC-7a, AC-13).
 *
 * A ZERO ROW UPDATE IS A FAILURE, NEVER A SILENT NO-OP (invariant 4). Row level
 * security excludes a row that is not the caller's by returning no rows rather
 * than by raising, so without this check an edit aimed at somebody else's entry
 * would answer with a clean response and redirect as though it had worked.
 *
 * THE COUNT COMES FROM `{ count: "exact" }`, NEVER FROM `.select()`. supabase-js
 * returns no row count by default, and the row's own data is not needed
 * afterwards, so asking for the row back would be reading a record only to
 * count it.
 */
export async function updateWorkExperience(
  previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const outcome = await Sentry.startSpan(
    {
      name: "profile.save_work_experience",
      op: "db.query",
      attributes: { operation: "update" },
    },
    async (): Promise<ActionState | undefined> => {
      const supabase = await createClient();
      const caller = await callerId(supabase);

      if (isFailure(caller)) {
        return failedStateWithMessage(formData, caller.message);
      }

      const entry = entryIdSchema.safeParse(formData.get("entry_id"));

      if (!entry.success) {
        /**
         * A malformed id is reported the same way a stale one is (AC-13). The
         * page cannot tell a stranger which entry ids exist, so it does not try.
         */
        const missing = failure({
          kind: PROFILE_FAILURES.entry_missing.kind,
          severity: PROFILE_FAILURES.entry_missing.severity,
          message: PROFILE_FAILURES.entry_missing.message,
        });

        return failedStateWithMessage(formData, missing.message);
      }

      const parsed = workExperienceSchema(currentMonth()).safeParse(
        workExperienceFields(formData),
      );

      if (!parsed.success) {
        return failedState(
          formData,
          parsed.error,
          PROFILE_FAILURES.validation_failed.message,
        );
      }

      const attempted = await attempt(
        {
          kind: PROFILE_FAILURES.database_unavailable.kind,
          message: PROFILE_FAILURES.database_unavailable.message,
        },
        async () =>
          await supabase
            .from("work_experience")
            .update(workExperienceColumns(parsed.data), { count: "exact" })
            .eq("id", entry.data),
      );

      if (isFailure(attempted)) {
        return failedStateWithMessage(formData, attempted.message);
      }

      const { error, count } = attempted.value;

      if (error) {
        const failed = databaseFailure(error);
        return failedStateWithMessage(formData, failed.message);
      }

      if (count === 0) {
        const missing = failure({
          kind: PROFILE_FAILURES.entry_missing.kind,
          severity: PROFILE_FAILURES.entry_missing.severity,
          message: PROFILE_FAILURES.entry_missing.message,
        });

        return failedStateWithMessage(formData, missing.message);
      }

      revalidatePath(PROFILE_PATH);
      return undefined;
    },
  );

  if (outcome !== undefined) return outcome;

  redirect(PROFILE_PATH);
}

/**
 * Work history: remove one entry (AC-8).
 *
 * SUBMITTED ONLY FROM THE CONFIRMATION FORM'S OWN POST. The confirmation URL
 * (`?delete=experience&entry=<id>`) mutates nothing by itself, which is what
 * keeps it safe to link, prefetch or bookmark (invariant 7). A later change must
 * not turn this into a one click delete link.
 *
 * A DELETE THAT TOUCHES ZERO ROWS IS A VISIBLE FAILURE (invariant 4). The entry
 * was already gone, or was never the caller's. Either way, reporting success
 * would tell somebody their data had been removed when nothing happened.
 */
export async function deleteWorkExperience(
  previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const outcome = await Sentry.startSpan(
    { name: "profile.delete_work_experience", op: "db.query" },
    async (): Promise<ActionState | undefined> => {
      const supabase = await createClient();
      const caller = await callerId(supabase);

      if (isFailure(caller)) {
        return failedStateWithMessage(formData, caller.message);
      }

      const entry = entryIdSchema.safeParse(formData.get("entry_id"));

      if (!entry.success) {
        const missing = failure({
          kind: PROFILE_FAILURES.entry_missing.kind,
          severity: PROFILE_FAILURES.entry_missing.severity,
          message: PROFILE_FAILURES.entry_missing.message,
        });

        return failedStateWithMessage(formData, missing.message);
      }

      const attempted = await attempt(
        {
          kind: PROFILE_FAILURES.database_unavailable.kind,
          message: PROFILE_FAILURES.database_unavailable.message,
        },
        async () =>
          await supabase
            .from("work_experience")
            .delete({ count: "exact" })
            .eq("id", entry.data),
      );

      if (isFailure(attempted)) {
        return failedStateWithMessage(formData, attempted.message);
      }

      const { error, count } = attempted.value;

      if (error) {
        const failed = databaseFailure(error);
        return failedStateWithMessage(formData, failed.message);
      }

      if (count === 0) {
        const missing = failure({
          kind: PROFILE_FAILURES.entry_missing.kind,
          severity: PROFILE_FAILURES.entry_missing.severity,
          message: PROFILE_FAILURES.entry_missing.message,
        });

        return failedStateWithMessage(formData, missing.message);
      }

      revalidatePath(PROFILE_PATH);
      return undefined;
    },
  );

  if (outcome !== undefined) return outcome;

  redirect(PROFILE_PATH);
}

/**
 * Search preferences: create the row, or update it in place (AC-9, AC-10).
 *
 * ALWAYS AN UPSERT ON `profile_id`, the same rule identity follows. AC-10's "no
 * row until an explicit save" still holds, because this upsert only ever runs
 * from this section's own action: nothing else in the product writes
 * `job_preference`, so a profile with no stated preferences has no row rather
 * than a row full of defaults (invariant 5).
 */
export async function savePreferences(
  previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const outcome = await Sentry.startSpan(
    { name: "profile.save_preferences", op: "db.query" },
    async (): Promise<ActionState | undefined> => {
      const supabase = await createClient();
      const caller = await callerId(supabase);

      if (isFailure(caller)) {
        return failedStateWithMessage(formData, caller.message);
      }

      const present = await requireProfileRow(supabase);

      if (isFailure(present)) {
        return failedStateWithMessage(formData, present.message);
      }

      const parsed = preferencesSchema.safeParse({
        desired_titles: formData.get("desired_titles") ?? "",
        desired_locations: formData.get("desired_locations") ?? "",
        remote_preference: formData.get("remote_preference") ?? "",
        minimum_pay: formData.get("minimum_pay") ?? "",
        minimum_pay_currency: formData.get("minimum_pay_currency") ?? "",
      });

      if (!parsed.success) {
        return failedState(
          formData,
          parsed.error,
          PROFILE_FAILURES.validation_failed.message,
        );
      }

      const attempted = await attempt(
        {
          kind: PROFILE_FAILURES.database_unavailable.kind,
          message: PROFILE_FAILURES.database_unavailable.message,
        },
        async () =>
          await supabase.from("job_preference").upsert(
            {
              /** Invariant 1: from verified claims, never from the form. */
              profile_id: caller.value,
              desired_titles: [...parsed.data.desired_titles],
              desired_locations: [...parsed.data.desired_locations],
              remote_preference: parsed.data.remote_preference,
              /**
               * The pair is written together or not at all, mirroring
               * `job_preference_pay_paired`. The schema already refused one
               * without the other, so this only has to carry the decision, not
               * make it.
               */
              minimum_pay:
                parsed.data.minimum_pay === undefined
                  ? null
                  : Number(parsed.data.minimum_pay),
              minimum_pay_currency: parsed.data.minimum_pay_currency ?? null,
            },
            { onConflict: "profile_id" },
          ),
      );

      if (isFailure(attempted)) {
        return failedStateWithMessage(formData, attempted.message);
      }

      if (attempted.value.error) {
        const failed = databaseFailure(attempted.value.error);
        return failedStateWithMessage(formData, failed.message);
      }

      revalidatePath(PROFILE_PATH);
      return undefined;
    },
  );

  if (outcome !== undefined) return outcome;

  redirect(PROFILE_PATH);
}
