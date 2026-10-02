import type { FailureKind, FailureSeverity } from "@/lib/result";

import { READ_FAILURES, SAVE_FAILURES } from "./copy";

/**
 * Every failure this feature can produce, one table, kind and severity fixed
 * per situation (spec 0024, `## Feature design`, API surface).
 *
 * THE SAME SHAPE AS `PROFILE_FAILURES`, AND FOR THE SAME REASON: a table rather
 * than a choice at each call site, so the same outcome is never reported at two
 * severities and binding rule 4's ratio is not split in half.
 *
 * THE MESSAGES ARE THE SPEC'S `COPY-27`, `COPY-30` TO `COPY-33`, pulled from
 * `copy.ts` rather than written here, so a sentence the reader sees exists in
 * exactly one file.
 *
 * A VERSION CONFLICT IS NOT HERE, AND MUST NEVER BE ADDED. A `23505` on
 * `(profile_id, version_number)` is the database doing exactly what it was
 * asked, so it is a `ResumeSaveState` with `status: "conflict"`, never a
 * `Failure` (`src/lib/result.ts`, binding rule 3). Building it through
 * `failure()` would mark `resume.save_version` failed for the system working.
 */

interface ResumeFailureShape {
  readonly kind: FailureKind;
  readonly severity: FailureSeverity;
  /** Shown to the reader, above the field or in place of the page. */
  readonly message: string;
}

export const RESUME_FAILURES = {
  /** The action's own caller check found no session (binding rule 6). */
  session_missing: {
    kind: "session_missing",
    severity: "expected",
    message: SAVE_FAILURES.sessionMissing,
  },
  /**
   * The content failed the parse (blank or over length). The reader sees
   * `COPY-10` or `COPY-11` on the field, and no form level sentence, because
   * `COPY-33`'s advice to reload is the opposite of what fixes this.
   *
   * SO THIS MESSAGE IS NEVER SHOWN. It is what `failure()` reports to Sentry,
   * an operator's description rather than product copy, which is why it is the
   * one entry here not drawn from `copy.ts`.
   */
  content_invalid: {
    kind: "validation_failed",
    severity: "expected",
    message: "The resume text was blank or over the length limit.",
  },
  /**
   * A malformed `previousVersionNumber`, or a `23514` check violation reaching
   * the database past the parse. Neither has a field to sit beside, which is
   * exactly the case `COPY-33` is for.
   */
  save_unreadable: {
    kind: "validation_failed",
    severity: "expected",
    message: SAVE_FAILURES.unreadable,
  },
  /**
   * No profile row to attach the version to: a `23503`, most likely the
   * profile deleted in another tab mid edit.
   */
  profile_missing: {
    kind: "record_not_found",
    severity: "expected",
    message: SAVE_FAILURES.profileMissing,
  },
  /** The driver threw or returned an error these checks did not anticipate. */
  save_unavailable: {
    kind: "database_unavailable",
    severity: "unexpected",
    message: SAVE_FAILURES.unavailable,
  },
  /** A read of `resume_version` was refused or unreachable. */
  read_unavailable: {
    kind: "database_unavailable",
    severity: "unexpected",
    message: READ_FAILURES.page,
  },
  /** A returned row did not match the shape this feature parses. */
  read_malformed: {
    kind: "response_malformed",
    severity: "unexpected",
    message: READ_FAILURES.page,
  },
} as const satisfies Readonly<Record<string, ResumeFailureShape>>;

/** Postgres: a unique violation, here always the AC-9 version conflict. */
export const UNIQUE_VIOLATION = "23505";

/** Postgres: a foreign key violation, the profile row being gone. */
export const FOREIGN_KEY_VIOLATION = "23503";

/** Postgres: a check violation, the backstop behind the Zod parse. */
export const CHECK_VIOLATION = "23514";
