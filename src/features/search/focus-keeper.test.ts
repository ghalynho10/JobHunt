import { describe, expect, it } from "vitest";

import { focusWasOrphaned } from "./focus-keeper";

/**
 * The restore decision (spec 0015, AC-17, rule 1).
 *
 * THIS IS THE ONLY PART OF THE FOCUS MECHANISM A TEST HERE CAN REACH, and that
 * is worth stating plainly rather than leaving a reader to infer it from what
 * is absent. The unit project is `node` with no jsdom and no layout, so there
 * is no `document`, no focus, and no `<Suspense>` reveal to run. What survives
 * that is the pure decision below; everything else, the listener, the reveal,
 * the `.focus()` call and whether the reader actually ends up where they were,
 * needs a real browser and lives in this spec's `verify.md` instead.
 *
 * The elements here are plain objects compared by identity, which is exactly
 * what the function does with them.
 */

const body = {} as Element;
const searchBox = {} as Element;

describe("whether focus was orphaned", () => {
  it("says yes when the body holds focus", () => {
    expect(focusWasOrphaned(body, body)).toBe(true);
  });

  it("says yes when nothing holds focus at all", () => {
    /**
     * `document.activeElement` is typed as nullable and really can be null, so
     * this is not a hypothetical branch. Missing it would leave the restore
     * doing nothing in a case AC-17 names outright ("the body, or nothing").
     */
    expect(focusWasOrphaned(null, body)).toBe(true);
  });

  it("says no when a live element still holds focus", () => {
    /**
     * THE COUNTERWEIGHT, AND THE MORE IMPORTANT HALF. AC-17's first rule exists
     * because stealing focus from somebody who is using the page is a worse
     * defect than the one this mechanism fixes. A version that always returned
     * true would pass both tests above and fail this one.
     */
    expect(focusWasOrphaned(searchBox, body)).toBe(false);
  });
});
