/**
 * The profile page's sentences (spec 0010, `## Copy`).
 *
 * WRITTEN BY THE ENGINEER, USED VERBATIM. Every string below is copied
 * character for character from the spec's `## Copy` table. The spec says in
 * terms that `/develop` must not invent or reword any of them, so a change here
 * is a spec change first, not an edit.
 *
 * NO EM DASH, NO EN DASH, NO SEMICOLON, in any of them. That is spec 0007's
 * punctuation rule, carried here with no carve out, and it has a reason: this is
 * the only text a user actually reads, and em dash overuse is one of the most
 * cited markers of machine written text, which costs something real on a
 * portfolio facing product.
 *
 * ONE CONSTRAINT THESE STRINGS PUT ON THE PAGE, not a note about tone.
 * `HEADINGS` fixes the page's whole outline: one `h1` of "Profile" and four peer
 * `h2` section headings. The spec chose a fixed `h1` because AC-1 renders before
 * any `full_name` exists, so a name based heading would need a second outline
 * for first run. AC-17's keyboard and heading pass checks this one outline, not
 * two, so a section added later takes an `h2` here rather than inventing its own
 * level.
 */

/**
 * `COPY-1`. First run, under the identity form, before any profile row exists
 * (AC-1). It is the plain text line AC-1 asks for in place of a control that
 * cannot do anything yet, so it names what comes next without offering it.
 */
export const FIRST_RUN_NOTE =
  "Your name is all this needs to start. Skills, experience and search preferences open up once you save it.";

/**
 * `COPY-2`. The page title and the four section headings.
 *
 * A single object rather than four loose constants, so the outline is readable
 * in one place and a fifth section cannot be added without seeing it.
 */
export const HEADINGS = {
  /** The `h1`. Fixed, never the person's own name. See the header comment. */
  page: "Profile",
  identity: "Personal details",
  skills: "Skills",
  experience: "Experience",
  preferences: "Search preferences",
} as const;

/**
 * `COPY-3`. Search preferences, before a `job_preference` row exists (AC-10).
 *
 * It is what stands in for the section's values, and it is deliberately not a
 * rendered set of defaults: no row exists, so showing "No preference" and a
 * blank pay would be a default that reads like something the user chose.
 */
export const PREFERENCES_NOT_SET =
  "Not set yet. Add the titles, locations and pay you're aiming for.";

/**
 * `COPY-4`. An `entry` id that resolves to no row, whether stale, malformed, or
 * not the caller's (AC-13).
 *
 * ONE SENTENCE FOR ALL THREE CASES, on purpose. Telling a stale id apart from
 * one that was never the caller's would confirm to a stranger that a given entry
 * id exists and belongs to somebody, which is a thing the page has no reason to
 * answer.
 */
export const ENTRY_GONE =
  "That entry is no longer on your profile. It may have been removed in another tab.";

/**
 * `COPY-5`. The delete confirmation for a work history entry (AC-8).
 *
 * The entry is NAMED in the question, which is what AC-8 means by a
 * confirmation step: a bare "are you sure" beside a list of five roles does not
 * tell anybody which one is about to go.
 *
 * @param title The entry's own job title, as stored.
 * @param company The entry's own company, as stored.
 */
export function deleteConfirmation(title: string, company: string): string {
  return `Remove ${title} at ${company}? This can't be undone.`;
}

/**
 * `COPY-6`. The section and entry controls.
 *
 * Five labels for every control on the page, so two sections cannot end up
 * calling the same action different things.
 */
export const CONTROLS = {
  edit: "Edit",
  addRole: "Add role",
  save: "Save",
  cancel: "Cancel",
  remove: "Remove",
} as const;

/**
 * `COPY-1` (spec 0023). A commit refused as a case insensitive duplicate
 * (AC-5). The existing chip's own casing, never the one just typed.
 */
export function alreadyAdded(existingValue: string): string {
  return `"${existingValue}" is already added.`;
}

/**
 * `COPY-2` (spec 0023). A commit refused for length (AC-6), also read by
 * `schemas.ts` in place of its three former inline `tooLong` messages.
 *
 * @param noun `skill`, `title` or `location`.
 * @param max The character cap, from `limits.ts`, never hardcoded here.
 */
export function tooLongValue(noun: string, max: number): string {
  return `Keep each ${noun} to ${max} characters or fewer.`;
}

/**
 * `COPY-3` (spec 0023). A commit refused on `desired_titles` or
 * `desired_locations` for the count cap (AC-6), also read by `schemas.ts` in
 * place of its two former inline `tooMany` messages.
 *
 * @param noun `title` or `location`.
 * @param max The count cap, from `limits.ts`, never hardcoded here.
 */
export function tooManyValues(noun: string, max: number): string {
  return `Add at most ${max} ${noun}s.`;
}

/**
 * `COPY-4` (spec 0023). A paste where one or more lines were refused,
 * aggregated into one message rather than one per refused line (AC-7).
 */
export function pasteRefusedSome(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : noun + "s"} could not be added.`;
}

/**
 * `COPY-5` (spec 0023). A chip removed, by its own control or the Backspace
 * shortcut, announced only through the hidden live region (AC-9, AC-10).
 */
export function chipRemoved(value: string): string {
  return `Removed ${value}.`;
}

/**
 * `COPY-6` (spec 0023). A chip marked pending removal by the first Backspace,
 * announced only (AC-10).
 */
export function chipPendingRemoval(value: string): string {
  return `${value} marked for removal. Press Backspace again to remove it.`;
}

/**
 * `COPY-7` (spec 0023). The pending mark cleared without removing the chip,
 * announced only (AC-10).
 */
export function chipPendingRemovalCleared(value: string): string {
  return `${value} is no longer marked for removal.`;
}

/**
 * `COPY-8` (spec 0023). The accessible name of a chip's remove control
 * (AC-9), never the page's generic `CONTROLS.remove` label.
 */
export function removeChipLabel(value: string): string {
  return `Remove ${value}`;
}
