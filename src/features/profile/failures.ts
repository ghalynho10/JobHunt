import type { FailureKind, FailureSeverity } from "@/lib/result";

/**
 * Spec 0010's `## Failure table`, as a value.
 *
 * NAMED THE SAME WAY `AUTH_FAILURES` FIXES KIND AND SEVERITY PER CODE, and for
 * the same reason: a table rather than a `switch` at each call site, so no
 * action picks a severity in the moment. Six write paths raising the same
 * outcome with two different severities would split binding rule 4's ratio in
 * half and make the alert quieter exactly as the problem spread.
 *
 * THE KEYS ARE SITUATIONS, NOT KINDS. Three separate situations map to
 * `record_not_found` and each says something different to the reader, so
 * collapsing them onto the kind would lose the message while keeping the
 * grouping. The kind is what Sentry fingerprints on, and it is the same for all
 * three, which is the intended grouping.
 */

interface ProfileFailureShape {
  readonly kind: FailureKind;
  readonly severity: FailureSeverity;
  /**
   * Safe to show a user by the `Failure` contract, and these ones actually are
   * shown: an action returns the message into its form's own state, so the
   * reader sees why nothing was written rather than a form that appears to have
   * submitted. Never put a record or a database detail in one.
   */
  readonly message: string;
}

export const PROFILE_FAILURES = {
  /** A Zod parse failed. The per field messages travel separately. */
  validation_failed: {
    kind: "validation_failed",
    severity: "expected",
    message: "Nothing was saved. Check the fields marked below.",
  },
  /**
   * The caller check inside the action found no session. Binding rule 6: every
   * action verifies its own caller, whatever page rendered the form.
   */
  session_missing: {
    kind: "session_missing",
    severity: "expected",
    message: "Your session has ended. Sign in again to save this.",
  },
  /**
   * A section save arrived before any profile row exists.
   *
   * A DEFENCE, NOT AN EXPECTED PATH. AC-1 renders no skills, experience or
   * preferences control until the profile row is there, so this is unreachable
   * through `/profile` itself and only a direct call to the action can produce
   * it. It is still handled, because a Server Action is a callable endpoint
   * whatever page renders it.
   */
  profile_missing: {
    kind: "record_not_found",
    severity: "expected",
    message: "Save your personal details first. The rest builds on that.",
  },
  /**
   * A work history update or delete resolved to zero rows: the entry is gone,
   * or was never the caller's (invariant 4).
   *
   * ROW LEVEL SECURITY EXCLUDING A ROW IS NEVER READ AS A SUCCESSFUL NO-OP.
   * That is the whole point of detecting the zero row case rather than letting
   * a clean response stand for a write that touched nothing.
   */
  entry_missing: {
    kind: "record_not_found",
    severity: "expected",
    message: "That entry is no longer on your profile, so nothing was changed.",
  },
  /**
   * A skill name collided on `(profile_id, lower(name))` after this feature's
   * own cleanup already deduplicated the submitted list (invariant 2).
   *
   * MAPPED TO `validation_failed`, NEVER TO `database_unavailable`. The database
   * is working perfectly here: another tab wrote the same name first. Filing it
   * as an outage would put an ordinary concurrency outcome into the ratio that
   * alerts on real ones.
   */
  skill_conflict: {
    kind: "validation_failed",
    severity: "expected",
    message:
      "One of those skills was added somewhere else first. Reload and try again.",
  },
  /** The driver threw, or returned an error these checks did not anticipate. */
  database_unavailable: {
    kind: "database_unavailable",
    severity: "unexpected",
    message: "Could not reach the database, so nothing was saved.",
  },
  /** A returned row did not match the shape this feature parses. */
  response_malformed: {
    kind: "response_malformed",
    severity: "unexpected",
    message: "A stored row did not match the shape we parse.",
  },
} as const satisfies Readonly<Record<string, ProfileFailureShape>>;

/**
 * The Postgres error code for a unique violation.
 *
 * Named rather than written as a bare string at the call site, because `23505`
 * beside a comparison tells a later reader nothing about which of the two
 * plausible skills failures they are looking at.
 */
export const UNIQUE_VIOLATION = "23505";

/**
 * The Postgres error code for a foreign key violation.
 *
 * `addWorkExperience` with no profile row raises this rather than returning
 * zero rows, so the spec maps it to `record_not_found` here rather than letting
 * it fall through to `database_unavailable`.
 */
export const FOREIGN_KEY_VIOLATION = "23503";
