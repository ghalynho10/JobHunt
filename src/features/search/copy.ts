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
  /**
   * `COPY-8` of spec 0014. Shown when the read behind the applied markers fails
   * (spec 0014, AC-9).
   *
   * THE SAME SHAPE AS `prefillFailed` DIRECTLY ABOVE, and added for the same
   * reason before it could ship wrong. Without it, a failed read renders twenty
   * cards with no applied marker, which is exactly the screen a reader who has
   * applied to none of them sees. A database outage would silently make the
   * claim "you have applied to none of these", which the app cannot stand
   * behind.
   *
   * It says the results are still usable, because they are: the failure costs
   * the markers and nothing else.
   */
  appliedReadFailed:
    "We couldn't check which jobs you've already applied to, so none are marked below.",
  /**
   * `COPY-8` of spec 0015. The results list's own accessible name, so AC-17's
   * fallback focus target announces as something rather than as an unnamed
   * list.
   *
   * IT LIVES HERE RATHER THAN IN `SCORING_COPY`, even though spec 0015 owns the
   * criterion, for the same reason `appliedReadFailed` directly above lives
   * here while spec 0014 owns it: the string belongs to whichever component
   * renders it, and `ResultList` is this feature's. That component deliberately
   * knows nothing about bands or outcomes, and importing the scoring feature's
   * copy into it to name a list would be the first thread of exactly the
   * dependency its own header rules out.
   *
   * IT DELIBERATELY DOES NOT SAY "RANKED". The one time it is read aloud is the
   * defensive path where the ranking could not be matched back to a control, so
   * a name claiming the list is ranked would be least trustworthy exactly when
   * it is heard.
   */
  resultsListLabel: "Search results",
  /**
   * `COPY-1` of spec 0020. The ambient usage line, shown on every `/search`
   * render once the read succeeds (spec 0020, AC-1).
   *
   * A FUNCTION RATHER THAN A STRING, because the two numbers are read live
   * and neither may be a literal here: `capValue` comes from `usage_cap`, so
   * an operator's no deploy change to the cap shows up on the next render
   * (AC-5), and `consumedCount` is `usage_gate_counter.consumed_count`, never
   * `attempt_count` (AC-2). `SCORING_COPY.removedSkills` is the existing
   * precedent for a function in a copy registry.
   *
   * IT SAYS "USED" OUT LOUD. "18 of 25" alone leans on convention to mean
   * consumed rather than remaining, and the two read identically to somebody
   * seeing the line for the first time while deciding whether to search
   * again.
   *
   * IT IS AMBIENT STATUS, NOT A WARNING, and there is deliberately no
   * threshold at which it changes register. A line that stays calm at 3 of 25
   * and turns urgent at 24 of 25 would be a second, unspecced behaviour; the
   * number is the information, and it is on the page every time.
   */
  usageThisWeek: (consumedCount: number, capValue: number): string =>
    `Searches used this week: ${consumedCount} of ${capValue}.`,
  /**
   * `COPY-2` of spec 0020. Shown when the usage read fails (AC-6).
   *
   * THE SAME SHAPE AS `prefillFailed` AND `appliedReadFailed` ABOVE, and added
   * for the same reason those two were: rendering nothing, or a zero, would
   * hand a database outage the meaning of "you have used none of your
   * allowance", which is a claim the app cannot make. It names what was lost
   * and nothing more.
   *
   * ITS SECOND HALF IS `prefillFailed`'S, WORD FOR WORD ("You can still
   * search."), because the situation is word for word the same: one read on
   * this page failed and the search itself is unaffected. Two different
   * sentences for one fact would suggest two different facts.
   */
  usageUnavailable:
    "We couldn't load your search count just now. You can still search.",
} as const;
