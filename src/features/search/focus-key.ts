import type { Listing } from "./adzuna";

/**
 * The focus key: which control a reader was on before the ranked list arrived
 * (spec 0015, AC-17).
 *
 * A PLAIN MODULE RATHER THAN PART OF `focus-keeper.tsx`, and the client
 * boundary is what forces the split. `focus-keeper.tsx` carries `"use client"`,
 * so every one of its exports reaches a Server Component as a client reference
 * rather than as a function. `result-card.tsx` builds these keys during the
 * server render, and calling a client reference there throws. Both sides
 * import from here, so the recorder, the restorer and the two controls read
 * one definition of the key rather than three that could drift.
 */

/**
 * The attribute a focusable card control carries.
 *
 * A `data-` ATTRIBUTE RATHER THAN AN `id`. The same control is rendered twice
 * across one search, once in the pending list and once in the ranked list, and
 * during the reveal both trees briefly exist; two nodes sharing an `id` would
 * be invalid exactly then.
 */
export const FOCUS_KEY_ATTRIBUTE = "data-focus-key";

/**
 * The attribute on the results list itself, AC-17's fallback focus target.
 *
 * SHARED WITH `result-list.tsx` AS A CONSTANT rather than written out on both
 * sides, because the restorer finding nothing is silent: a typo here would
 * leave a reader on the body in exactly the case this fallback exists for, and
 * nothing would say so.
 */
export const RESULTS_LIST_ATTRIBUTE = "data-results-list";

/**
 * The controls a card exposes, as exactly two literals (AC-17).
 *
 * CLOSED ON PURPOSE. AC-17 says a third focusable control added to a card
 * later "adds a third literal here first", so a new control cannot be tagged
 * with a free text key that no other part of this mechanism knows about.
 */
export type FocusControl = "posting-link" | "apply";

/**
 * `<source>:<sourceJobId>:<control>` (AC-17).
 *
 * THE FIRST TWO SEGMENTS ARE THE LISTING'S OWN IDENTITY, the same pair
 * `result-list.tsx` already composes into its React key, which is what makes
 * the key survive the one time re-sort.
 *
 * NEVER A POSITION IN THE LIST. Position is exactly what the re-sort changes,
 * so a key built from an index would hand focus back to whichever job happened
 * to land in that slot. That is the whole reason this function exists rather
 * than a `querySelectorAll(...)[index]` at restore time.
 */
export function focusKey(
  listing: Pick<Listing, "source" | "sourceJobId">,
  control: FocusControl,
): string {
  return `${listing.source}:${listing.sourceJobId}:${control}`;
}
