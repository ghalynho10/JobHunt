"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  attempt,
  failure,
  isFailure,
  success,
  type Result,
} from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

import {
  CHECK_VIOLATION,
  FOREIGN_KEY_VIOLATION,
  RESUME_FAILURES,
  UNIQUE_VIOLATION,
} from "./failures";
import { echoedContent, type ResumeSaveState } from "./form-state";
import { saveResumeSchema } from "./schemas";

/**
 * Save a new resume version (spec 0024, AC-3, AC-4, AC-9).
 *
 * EVERY SAVE IS AN INSERT (AC-4, invariant 1). There is no update path at all:
 * `authenticated` holds no `update` privilege on `resume_version`, so even a bug
 * here could not rewrite an earlier version.
 *
 * THE CONFLICT CHECK IS THE UNIQUE CONSTRAINT, NOT A PRE READ (AC-9). The
 * insert claims `previousVersionNumber + 1`, and if another tab already claimed
 * it, `(profile_id, version_number)` refuses the row with a `23505`. A `select`
 * first would only move the race, not close it.
 *
 * `previousVersionNumber` IS WHAT WAS CURRENT WHEN THE EDITOR LOADED, never the
 * number of the text on screen, so saving a restored version 2 over a current
 * version 5 inserts version 6 rather than colliding with version 3.
 *
 * A CONFLICT IS NOT A FAILURE. It returns `status: "conflict"` with the newer
 * version's number and raw text, and builds nothing through `failure()`, so
 * the `resume.save_version` span stays clean for the system working as
 * designed (`src/lib/result.ts`, binding rule 3). Never add it to an alert.
 *
 * THE SPAN OPENS FIRST (binding rule 4), `revalidatePath` runs inside it, and
 * `redirect()` runs outside it: `redirect()` works by throwing, and a throw
 * inside the span would record the save as failing the moment it succeeded.
 * That is the order every action in `src/features/profile/actions.ts` follows.
 */
export async function saveResumeVersion(
  previous: ResumeSaveState,
  formData: FormData,
): Promise<ResumeSaveState> {
  const outcome = await Sentry.startSpan(
    { name: "resume.save_version", op: "db.query" },
    async (): Promise<ResumeSaveState | undefined> => {
      const supabase = await createClient();
      const caller = await callerId(supabase);

      if (isFailure(caller)) return failed(formData, caller.message);

      const parsed = saveResumeSchema.safeParse({
        content: formData.get("content") ?? "",
        previousVersionNumber: formData.get("previousVersionNumber") ?? "",
      });

      if (!parsed.success) return refusedParse(formData, parsed.error);

      const { content, previousVersionNumber } = parsed.data;

      const inserted = await attempt(
        {
          kind: RESUME_FAILURES.save_unavailable.kind,
          message: RESUME_FAILURES.save_unavailable.message,
        },
        async () =>
          await supabase.from("resume_version").insert({
            /** From verified claims, never from the form. */
            profile_id: caller.value,
            version_number: previousVersionNumber + 1,
            content,
          }),
      );

      if (isFailure(inserted)) return failed(formData, inserted.message);

      const error = inserted.value.error;

      if (error) {
        if (error.code === UNIQUE_VIOLATION) {
          return conflictState(supabase, formData);
        }

        if (error.code === FOREIGN_KEY_VIOLATION) {
          return reported(formData, "profile_missing", error);
        }

        /**
         * The parse is stricter than both database checks (see `schemas.ts`),
         * so this is a backstop that should never fire. If it does, the parse
         * and the migration have drifted apart, and there is no single field
         * to blame, which is `COPY-33`'s case.
         */
        if (error.code === CHECK_VIOLATION) {
          return reported(formData, "save_unreadable", error);
        }

        return reported(formData, "save_unavailable", error);
      }

      revalidatePath(RESUME_PATH);
      revalidatePath(PROFILE_PATH);
      return undefined;
    },
  );

  if (outcome !== undefined) return outcome;

  /** Outside the span: `redirect()` throws, and a throw inside reads as failure. */
  redirect(RESUME_PATH);
}

/** Where a successful save lands, and the page it changes. */
const RESUME_PATH = "/resume";

/** The page whose resume card reads the same history (AC-10). */
const PROFILE_PATH = "/profile";

/**
 * The caller's own id, verified inside the action (binding rule 6).
 *
 * BINDING RULE 5: `getClaims()` can throw on a genuine service failure, which
 * is `external_service_failed` and reads as `COPY-32`, distinct from the
 * returned `error` for an absent session, which is `COPY-30`.
 */
async function callerId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Result<string>> {
  const attempted = await attempt(
    {
      kind: "external_service_failed",
      message: RESUME_FAILURES.save_unavailable.message,
    },
    () => supabase.auth.getClaims(),
  );

  if (isFailure(attempted)) return attempted;

  const { data, error } = attempted.value;

  if (error || !data) {
    return failure({
      kind: RESUME_FAILURES.session_missing.kind,
      severity: RESUME_FAILURES.session_missing.severity,
      message: RESUME_FAILURES.session_missing.message,
    });
  }

  return success(data.claims.sub);
}

/** A refused save with a whole form sentence, keeping the typed text. */
function failed(formData: FormData, message: string): ResumeSaveState {
  return {
    status: "failed",
    message,
    errors: {},
    values: echoedContent(formData),
  };
}

/** A database refusal, reported through `failure()` and shown by its sentence. */
function reported(
  formData: FormData,
  situation: "profile_missing" | "save_unreadable" | "save_unavailable",
  error: { readonly code?: string; readonly hint?: string | null },
): ResumeSaveState {
  const entry = RESUME_FAILURES[situation];
  const refused = failure({
    kind: entry.kind,
    severity: entry.severity,
    message: entry.message,
    context: { code: error.code, hint: error.hint },
    cause: error,
  });

  return failed(formData, refused.message);
}

/**
 * A parse failure.
 *
 * A CONTENT ERROR WINS, AND SHOWS ON THE FIELD ALONE (`COPY-10` or `COPY-11`),
 * with no form level sentence. `COPY-33` is shown only when the content was
 * fine and the hidden `previousVersionNumber` was not, because its advice (copy
 * your text and reload) is wrong for a reader who only needs to edit the text.
 */
function refusedParse(formData: FormData, error: z.ZodError): ResumeSaveState {
  const contentIssue = error.issues.find(
    (issue) => issue.path[0] === "content",
  );
  const situation =
    contentIssue === undefined ? "save_unreadable" : "content_invalid";
  const entry = RESUME_FAILURES[situation];

  failure({
    kind: entry.kind,
    severity: entry.severity,
    message: entry.message,
    context: { issues: z.treeifyError(error) },
  });

  if (contentIssue !== undefined) {
    return {
      status: "failed",
      errors: { content: contentIssue.message },
      values: echoedContent(formData),
    };
  }

  return failed(formData, entry.message);
}

/**
 * The AC-9 conflict: the newer version's number and raw text, read after the
 * insert has already been refused.
 *
 * A FAILURE OF THIS FOLLOW UP READ IS A REAL FAILURE (`database_unavailable`,
 * `COPY-32`). The conflict itself is not, but a conflict the reader cannot be
 * shown would leave them unable to compare, so it says so rather than
 * returning a conflict state with nothing in it.
 */
async function conflictState(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData,
): Promise<ResumeSaveState> {
  const selected = await attempt(
    {
      kind: RESUME_FAILURES.save_unavailable.kind,
      message: RESUME_FAILURES.save_unavailable.message,
    },
    async () =>
      await supabase
        .from("resume_version")
        .select("version_number, content")
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle(),
  );

  if (isFailure(selected)) return failed(formData, selected.message);

  const { data, error } = selected.value;

  if (error) return reported(formData, "save_unavailable", error);

  const parsed = z
    .object({
      version_number: z.number().int().positive(),
      content: z.string(),
    })
    .safeParse(data);

  if (!parsed.success) {
    const malformed = failure({
      kind: RESUME_FAILURES.save_unavailable.kind,
      severity: RESUME_FAILURES.save_unavailable.severity,
      message: RESUME_FAILURES.save_unavailable.message,
      context: { issues: z.treeifyError(parsed.error) },
      cause: parsed.error,
    });

    return failed(formData, malformed.message);
  }

  return {
    status: "conflict",
    errors: {},
    values: echoedContent(formData),
    currentVersionNumber: parsed.data.version_number,
    currentVersionContent: parsed.data.content,
  };
}
