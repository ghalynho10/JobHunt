/**
 * The search screen's five sentences (spec 0013, `## Copy`).
 *
 * APPROVED BY THE ENGINEER AND USED VERBATIM, mirroring
 * `src/lib/usage-gating/copy.ts` and `src/features/auth/copy.ts`: a change
 * here is a spec change first, not an edit.
 *
 * THE FIVE GATE REFUSAL SENTENCES ARE NOT HERE. Those belong to feature 10 and
 * live in `src/lib/usage-gating/copy.ts`'s `SENTENCES` map; this feature
 * renders them verbatim and writes no copy of its own for them (AC-3).
 */
export const SEARCH_COPY = {
  /** `COPY-1`. The title field's label. */
  titleLabel: "Job title",
  /** `COPY-2`. The location field's label. */
  locationLabel: "Location",
  /**
   * `COPY-3`. Shown when both fields are submitted blank (AC-2). It says what
   * is needed rather than only that something is wrong, and names that one
   * field alone is enough, which is the rule a reader cannot guess.
   */
  bothFieldsBlank:
    "Enter a job title or a location to search. Either one on its own is enough.",
  /**
   * `COPY-4`. Shown when a search runs and matches nothing (AC-4). AN
   * ORDINARY OUTCOME, NOT A FAILURE: no `role="alert"`, matching the
   * convention the placeholder page this replaced already set, and the
   * sentence carries a next step rather than an apology.
   */
  noResults:
    "No listings matched that search. Try a broader title, or a wider location.",
  /**
   * `COPY-5`. Shown when the Adzuna call fails or its response cannot be
   * parsed (AC-5). Generic and honest: it names no service and no technical
   * cause, says plainly that the reader did not cause it, and promises only a
   * retry, which is the one thing the code can actually back up.
   */
  searchFailed:
    "We couldn't load listings just now. Nothing you did caused this. Try again in a few minutes.",
  /**
   * `COPY-6`. Shown when the `job_preference` read behind the prefill fails
   * (AC-9). ADDED 2026-09-04 AFTER A FRESH MODEL REVIEW, and the gap it closes
   * is worth stating: without it a failed read renders the exact screen a
   * reader with no stated preferences sees, so a database outage silently
   * borrows the meaning of "you have not set any". That is the default that
   * reads like success the project's own rule forbids.
   *
   * It says the search still works, because it does: the failure costs the
   * prefill and nothing else.
   */
  prefillFailed:
    "We couldn't load your saved preferences, so the fields below start empty. You can still search.",
} as const;
