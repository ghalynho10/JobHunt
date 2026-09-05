import type { FailureKind, FailureSeverity } from "@/lib/result";

/**
 * Spec 0014's failure table, as a value.
 *
 * THE SAME SHAPE AS `PROFILE_FAILURES`, and for the same reason: a table rather
 * than a `switch` at each call site, so no action picks a severity in the
 * moment. Two write paths raising the same outcome with two different
 * severities would split binding rule 4's ratio in half and make the alert
 * quieter exactly as a problem spread.
 *
 * THE KEYS ARE SITUATIONS, NOT KINDS. `already_applied`, `listing_rejected` and
 * `stale_build` all map to `validation_failed` and each says something
 * different to the reader. The kind is what Sentry fingerprints on and is
 * correctly shared; the message is what the reader needs and is not.
 */

interface ApplicationFailureShape {
  readonly kind: FailureKind;
  readonly severity: FailureSeverity;
  /**
   * Safe to show a user by the `Failure` contract, and these ones actually are
   * shown: an action returns the message into its form's own state. Never put a
   * record or a database detail in one.
   */
  readonly message: string;
}

export const APPLICATION_FAILURES = {
  /**
   * `COPY-2`. The same job marked applied twice (AC-4).
   *
   * `expected`, NOT `unexpected`, and `validation_failed` rather than
   * `database_unavailable`. The unique constraint refusing a second row is the
   * database working exactly as spec 0003 AC-7 designed it, not an outage.
   * Filing it as an outage would put an ordinary double click into the failure
   * rate alert's numerator.
   */
  already_applied: {
    kind: "validation_failed",
    severity: "expected",
    message: "You've already marked this job applied.",
  },
  /**
   * `COPY-3`. An apply with no `profile` row (AC-5).
   *
   * Spec 0003 AC-8 named this feature as the one that turns the foreign key's
   * refusal into a visible expected failure, and spec 0003's Follow-up recorded
   * that feature 12's `Done when` was missing the criterion. Without this
   * mapping the violation would fall through to `database_unavailable`, filing
   * a caller error as an outage.
   */
  profile_missing: {
    kind: "record_not_found",
    severity: "expected",
    message: "Set up your profile before you can apply to jobs.",
  },
  /**
   * `COPY-7`. The apply arrived from a page rendered by an older build (AC-21).
   *
   * WHY THIS SITUATION EXISTS AT ALL. The listing travels in the action's
   * encrypted closure, and the key is regenerated on every build (verified in
   * the installed Next.js docs, `data-security.md:526`: "actions can only be
   * invoked for a specific build"). Any results page left open across a deploy
   * therefore has an apply control the framework refuses. On a project that
   * deploys often this is the likeliest apply failure a real reader meets, and
   * a silent no operation would be exactly the failure that reads like success
   * `AGENTS.md` forbids.
   */
  stale_build: {
    kind: "validation_failed",
    severity: "expected",
    message: "This page is out of date. Refresh and try again.",
  },
  /**
   * The re-parse on arrival refused the listing (AC-2).
   *
   * Reachable two ways: a crafted call, and an advert whose `postedAt` is not a
   * real datetime. The second is why the message does not accuse the reader of
   * anything.
   */
  listing_rejected: {
    kind: "validation_failed",
    severity: "expected",
    message: "Something about that job listing could not be read. Try another.",
  },
  /**
   * The caller check inside the action found no session. Binding rule 6: every
   * action verifies its own caller, whatever page rendered the control.
   */
  session_missing: {
    kind: "session_missing",
    severity: "expected",
    message: "Your session has ended. Sign in again to record this.",
  },
  /** A removal that matched no row (AC-11). */
  application_missing: {
    kind: "record_not_found",
    severity: "expected",
    message: "That application is not there to remove.",
  },
  /** The driver failed, or raised a code this feature's own checks did not name. */
  database_unavailable: {
    kind: "database_unavailable",
    severity: "unexpected",
    message: "Something went wrong on our side. Try again in a moment.",
  },
} as const satisfies Record<string, ApplicationFailureShape>;

/**
 * The Postgres error code for a unique violation.
 *
 * `recordApplication` raises this when the same `(profile_id, source,
 * source_job_id)` is inserted twice, so the spec maps it to `already_applied`
 * here rather than letting it fall through to `database_unavailable`.
 */
export const UNIQUE_VIOLATION = "23505";

/**
 * The Postgres error code for a foreign key violation.
 *
 * `recordApplication` with no profile row raises this rather than returning
 * zero rows (spec 0003, AC-8).
 */
export const FOREIGN_KEY_VIOLATION = "23503";

/**
 * The Postgres error code for a check constraint violation.
 *
 * Named so it is never mistaken for an outage. Today it should be unreachable:
 * `listingSnapshotSchema` refuses an inverted salary and pairs the predicted
 * flag before the insert, so `application_predicted_pairing`,
 * `application_salary_currency_paired` and `application_salary_range_ordered`
 * all have nothing left to catch. It is mapped anyway, because "unreachable"
 * is a claim about today's parse and the database is the thing that actually
 * holds the line (spec 0003, invariant 4).
 */
export const CHECK_VIOLATION = "23514";
