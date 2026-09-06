/**
 * Every user facing string this feature renders (spec 0014, `## Copy`).
 *
 * ONE SLOT PER STRING, WRITTEN BY THE ENGINEER, the same convention specs 0007,
 * 0011 and 0013 use. Nothing here is composed at the call site, so the words a
 * reader sees are the words in the spec, and a change to either is visible as a
 * change to both.
 */

/** The controls, `COPY-1` and `COPY-5` and `COPY-6`. */
export const CONTROLS = {
  /** `COPY-1`, the apply control before it has been used. */
  markApplied: "Mark as applied",
  /** `COPY-1`, the same control once the row exists. */
  applied: "Applied",
  /** `COPY-5`, the empty state's way out. */
  searchForJobs: "Search for jobs",
  /** `COPY-6`, the link out from a recorded application. */
  viewPosting: "View the posting",
  /** The removal control, and the way back from the confirmation. */
  remove: "Remove",
  cancel: "Cancel",
} as const;

/**
 * `COPY-3`'s link text, kept beside its sentence.
 *
 * The sentence and the link are separate values because the link is an element
 * rather than text: gluing them into one string would force the message to be
 * rendered as HTML, which is how a copy slot becomes an injection surface.
 */
export const PROFILE_LINK_TEXT = "Set up your profile";

/**
 * `COPY-4`, the removal confirmation question.
 *
 * A FUNCTION, NOT A CONSTANT, because it names the job (spec 0010 AC-8 set this
 * precedent: a bare "are you sure" beside a list of applications does not tell
 * anybody which one is about to go). Mirrors `deleteConfirmation` in
 * `src/features/profile/copy.ts`.
 */
export function removeConfirmation(title: string, company: string): string {
  return `Remove your application to ${title} at ${company}? This can't be undone.`;
}

/**
 * The accessible name for one application's link out (spec 0014, AC-18).
 *
 * `COPY-6` IS THE SAME VISIBLE LABEL ON EVERY ROW, deliberately, and that is
 * why this exists. A list of ten links all named "View the posting" is
 * indistinguishable in a screen reader's link list, so the accessible name says
 * which posting this one is. Feature 11 solved the identical problem on the
 * results list (`src/features/search/result-card.tsx`).
 */
export function viewPostingLabel(title: string, company: string): string {
  return `${CONTROLS.viewPosting} for ${title} at ${company}`;
}

/**
 * The accessible name for one result's apply control (spec 0014, AC-1).
 *
 * Same reasoning as `viewPostingLabel`: twenty cards each carrying a control
 * named "Mark as applied" are twenty identical entries in a screen reader's
 * list of controls.
 */
export function markAppliedLabel(title: string, company: string): string {
  return `${CONTROLS.markApplied}: ${title} at ${company}`;
}

/** The page's own words. */
export const APPLICATIONS_COPY = {
  heading: "Applications",
  /**
   * `COPY-3` on `/applications`, unchanged from what feature 32 shipped. It
   * reads correctly as a description of an empty page, which is why the empty
   * state keeps it and adds a way out rather than replacing it (AC-17).
   */
  intro:
    "Every job you apply to will be recorded here, so you can see what you sent and when.",
} as const;
