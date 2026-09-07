import { describe, expect, it } from "vitest";

import type { Listing } from "./adzuna";
import { focusKey } from "./focus-key";

/**
 * The focus key (spec 0015, AC-17).
 *
 * WHAT THESE TESTS ARE ACTUALLY FOR. The key exists because `/search` re-sorts
 * its list once, under a reader who may be standing in it. Every test below is
 * really one claim in two halves: the key follows the LISTING, and it ignores
 * the POSITION. A key that tracked position would look correct in every render
 * and hand focus to the wrong job the one time it mattered.
 */

const listing = (id: string): Listing =>
  ({ source: "adzuna", sourceJobId: id }) as Listing;

describe("the focus key", () => {
  it("is the listing's source, its job id, and the control", () => {
    expect(focusKey(listing("111"), "posting-link")).toBe(
      "adzuna:111:posting-link",
    );
  });

  it("tells the two controls on one card apart", () => {
    const job = listing("111");

    expect(focusKey(job, "posting-link")).not.toBe(focusKey(job, "apply"));
  });

  it("tells two jobs apart on the same control", () => {
    expect(focusKey(listing("111"), "apply")).not.toBe(
      focusKey(listing("222"), "apply"),
    );
  });

  it("does not change when the same listing moves in the list", () => {
    /**
     * THE ONE THAT MATTERS. This is the re-sort in miniature: the same job,
     * read first from Adzuna's order and then from the ranked order, has to
     * produce the same key both times or focus lands on whatever job took its
     * slot. A key built from an index would fail here and pass everywhere else.
     */
    const adzunaOrder = [listing("111"), listing("222"), listing("333")];
    const ranked = [adzunaOrder[2]!, adzunaOrder[0]!, adzunaOrder[1]!];

    expect(focusKey(ranked[1]!, "apply")).toBe(
      focusKey(adzunaOrder[0]!, "apply"),
    );
  });

  it("matches the React key the list already composes from the same listing", () => {
    /**
     * AC-17 says the first two segments ARE the pair `result-list.tsx` uses as
     * its React key. Asserting the prefix keeps the two from drifting: if the
     * list ever keys its items differently, a card can survive a re-sort while
     * its focus key no longer identifies it.
     */
    const job = listing("111");

    expect(focusKey(job, "apply")).toBe(
      `${job.source}:${job.sourceJobId}:apply`,
    );
  });
});
