/**
 * The resume page's sentences (spec 0024, `## Copy`).
 *
 * WRITTEN BY THE ENGINEER, USED VERBATIM. Every string below is copied
 * character for character from the spec's `## Copy` table, and the spec says in
 * terms that `/develop` must not invent or reword any of them, so a change here
 * is a spec change first, not an edit. `COPY-15`, `COPY-24` and `COPY-25` hold
 * no text on purpose (the spec records why), so they have no export here.
 *
 * THIS FEATURE'S OWN FILE, NOT `src/features/profile/copy.ts`. Folder by
 * feature: the two share no copy module even where the shapes rhyme, so the
 * numbering restarts at this spec's own `COPY-1` with no collision to avoid.
 *
 * NO EM DASH, NO EN DASH, NO SEMICOLON, in any of them. That is spec 0007's
 * punctuation rule, carried with no carve out, and `copy.test.ts` enforces it
 * over every slot.
 *
 * The one number quoted here, the character ceiling, is passed in rather than
 * written into a string, so the sentence and the check cannot disagree.
 */

/** `COPY-1`. `/resume` with no resume version yet (AC-1). */
export const EMPTY_STATE = "You haven't written a resume yet.";

/**
 * `COPY-2` to `COPY-5`, `COPY-22` and `COPY-23`. The page's control labels, in
 * one place so two controls cannot call the same action different things.
 */
export const CONTROLS = {
  /**
   * `COPY-2`. Opens the editor seeded from the profile, on the empty state
   * and, unchanged, on the plain view once a resume exists (AC-1, AC-5).
   */
  startFromProfile: "Start from my profile",
  /** `COPY-3`. Opens the editor on the current version (AC-5). */
  edit: "Edit",
  /** `COPY-4`. Each version list row's control (AC-6). */
  restore: "Restore",
  /** `COPY-22`. The editor's submit control (AC-4). */
  save: "Save",
  /** `COPY-23`. The editor's exit control, the one carrying `onNavigate` (AC-7). */
  cancel: "Cancel",
} as const;

/** `COPY-5`. The marker on the version list row that is current (AC-6). */
export const CURRENT_VERSION_LABEL = "Current";

/** `COPY-6`. A `from` reference that is malformed or not the caller's own (AC-8). */
export const VERSION_GONE = "That version is no longer there.";

/** `COPY-7`. The conflict state, above the newer version's own raw text (AC-9). */
export function conflictMessage(versionNumber: number): string {
  return `Someone (likely you, in another tab) saved version ${versionNumber} while you were editing. Here's what it says now:`;
}

/** `COPY-8`. The conflict state's resubmit control (AC-9). */
export const SAVE_ANYWAY_LABEL = "Save my text as a new version anyway";

/**
 * `COPY-9`. The `onNavigate` confirmation before Cancel discards unsaved text
 * (AC-7). The separate `beforeunload` path shows the browser's own generic
 * prompt, which no modern browser lets a page customise.
 */
export const LEAVE_WITHOUT_SAVING_CONFIRM =
  "Leave without saving? Your changes to this resume will be lost.";

/** `COPY-10`. Save refused for blank or whitespace only content (AC-3). */
export const BLANK_CONTENT = "Write something before saving your resume.";

/** `COPY-11`. Save refused for content over the character ceiling (AC-3). */
export function tooLongContent(max: number): string {
  return `Keep your resume to ${max} characters or fewer.`;
}

/** `COPY-12`. The `/profile` resume card, once a resume exists (AC-10). */
export function resumeCard(versionNumber: number, date: string): string {
  return `Resume: version ${versionNumber}, last updated ${date}.`;
}

/** `COPY-13`. The `/profile` resume card, before any resume exists (AC-10). */
export const RESUME_CARD_EMPTY = "No resume yet.";

/**
 * `COPY-14`. The `/resume` `h1`, in every state, the editor included (AC-1,
 * AC-5). `COPY-15` deliberately reuses it rather than giving the editor a
 * second outline.
 */
export const PAGE_HEADING = "Resume";

/** `COPY-16`. The plain view, under the heading (AC-5). */
export function savedSummary(date: string, count: number): string {
  return `Last saved ${date}. ${count} version${count === 1 ? "" : "s"} saved.`;
}

/** `COPY-17`. The `h2` above the version list (AC-6). */
export const VERSIONS_HEADING = "Versions";

/** `COPY-18`. Each version list row (AC-6). */
export function versionRow(versionNumber: number, date: string): string {
  return `Version ${versionNumber}, saved ${date}`;
}

/**
 * `COPY-19`. The accessible name of each Restore control (AC-6). Every row's
 * visible label is `COPY-4`, so without this a screen reader's list of links is
 * N identical "Restore" entries. It contains the visible label, which WCAG
 * 2.5.3 (label in name) needs.
 */
export function restoreAccessibleName(versionNumber: number): string {
  return `Restore version ${versionNumber}`;
}

/** `COPY-20`. The textarea's label, including during a conflict (AC-2, AC-3, AC-9). */
export const EDITOR_LABEL = "Your resume";

/** `COPY-21`. Under the editor label (AC-2). */
export const EDITOR_HINT =
  "Markdown formatting works here. Headings start with ## and bold text is wrapped in **.";

/** `COPY-26`. The resume card's link into `/resume`, per state (AC-10). */
export const RESUME_CARD_LINK = {
  existing: "Open your resume",
  empty: "Write your resume",
} as const;

/**
 * `COPY-27`, `COPY-28` and `COPY-29`. A failed read, on `/resume` and on the
 * `/profile` card, answering `database_unavailable`, `response_malformed` and
 * `external_service_failed` (AC-2, AC-5, AC-10).
 */
export const READ_FAILURES = {
  /** `COPY-27`. */
  page: "We couldn't load your resume. Nothing has been lost, and trying again usually works.",
  /** `COPY-28`. The control under `COPY-27`, reloading `/resume`. */
  retry: "Try again",
  /** `COPY-29`. The card's own line; the rest of `/profile` renders normally. */
  card: "We couldn't load your resume just now.",
} as const;

/**
 * `COPY-30` to `COPY-33`. A refused save, above the field, one per failure kind
 * the action can return (AC-3, AC-9). `failures.ts` maps each kind to one of
 * these, so no call site picks a sentence in the moment.
 */
export const SAVE_FAILURES = {
  /** `COPY-30`, answering `session_missing`. */
  sessionMissing:
    "Your session has expired, so nothing was saved. Copy your text somewhere safe, then sign in again.",
  /** `COPY-31`, answering `record_not_found`. */
  profileMissing:
    "We couldn't find your profile, so there is nothing to attach this resume to. Open your profile, save it, then try again.",
  /** `COPY-32`, answering `database_unavailable` and `external_service_failed`. */
  unavailable:
    "We couldn't save your resume just now. Your text is still here, so try again in a moment.",
  /**
   * `COPY-33`, answering `validation_failed` ONLY when no field message
   * applies: a malformed `previousVersionNumber`. Never shown alongside
   * `COPY-10` or `COPY-11`, whose advice (fix the text) is the opposite of
   * this one's (reload), and reloading would throw the typed text away.
   */
  unreadable:
    "We couldn't read that save, so nothing was written. Copy your text somewhere safe, then reload this page.",
} as const;
