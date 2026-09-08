import { describe, expect, it } from "vitest";

import { BAND_ANCHORS } from "../rubric";

import { bandAnchorsHash } from "./band-anchors-hash";

/**
 * The rubric drift guard (spec 0017, AC-10).
 *
 * WHY THIS TEST IS THE POINT OF THE WHOLE FEATURE'S CHEAP HALF. Feature 15's
 * sixteen ground truth pairs each had their `expectedBand` argued from the
 * anchor wording below, BEFORE any model was run. Edit that wording and every
 * one of those expectations silently becomes an argument about text that no
 * longer exists, while all sixteen pairs still look perfectly valid and the
 * whole suite stays green.
 *
 * IT RUNS UNDER `pnpm test`, NOT `pnpm eval`, ON PURPOSE. The harness costs 80
 * real vendor calls and is run when somebody decides to; this runs on every
 * push, for free. A rubric edit is caught at commit time rather than weeks
 * later by a person diffing two JSON reports by hand.
 *
 * THE TEXT IS WRITTEN OUT INLINE HERE RATHER THAN SNAPSHOTTED. A snapshot file
 * is rewritten, without complaint and without a diff anybody reads, by a
 * routine `vitest -u`. That is the one failure mode this guard cannot afford,
 * so the expected text is source code that a person has to edit deliberately.
 *
 * WHEN THIS TEST FAILS, IT IS PROBABLY NOT WRONG. Changing an anchor is a real
 * decision: re-argue every affected pair in spec 0016's dataset
 * (`src/features/scoring/eval/pairs.ts`) against the new wording, then update
 * the text below and the hash to match.
 */

/**
 * Today's anchor text, as of 2026-09-08.
 *
 * Kept as a separate literal rather than compared field by field so `toEqual`
 * reports the whole map at once: a reader seeing one changed anchor beside the
 * four that did not change can tell an intentional rewording from an accident.
 */
const ANCHORS_AS_WRITTEN = {
  strong_match:
    "The candidate's skills and work history cover essentially everything the visible posting asks for, at a level of seniority the posting is asking for. There is no significant stretch to argue.",
  good_match:
    "The candidate covers most of what the visible posting asks for. One or two areas are unproven or a stretch, but the core of the work is clearly within reach of what they have already done.",
  possible_match:
    "The candidate covers a real part of what the visible posting asks for, and a real part is unproven. Applying would mean arguing that the experience transfers rather than pointing at it.",
  weak_match:
    "Only a small part of the candidate's skills and work history carries over. Most of what the visible posting asks for sits outside what they have done.",
  not_a_match:
    "The candidate's skills and work history do not carry over to this posting in any substantial way. It is a different kind of work.",
};

/** The digest of the text above, as of 2026-09-08. */
const HASH_AS_WRITTEN = "1b45f524b356";

describe("BAND_ANCHORS drift guard (covers AC-10)", () => {
  it("still says exactly what spec 0016's ground truth set was argued against", () => {
    expect(
      BAND_ANCHORS,
      "BAND_ANCHORS has changed. Every expectedBand in spec 0016's ground truth set (src/features/scoring/eval/pairs.ts) was argued from the previous wording before any model was run, so each affected pair has to be re-argued against the new text and this expectation updated to match. Do not just update this test.",
    ).toEqual(ANCHORS_AS_WRITTEN);
  });

  /**
   * THE SECOND ASSERTION IS NOT A DUPLICATE OF THE FIRST. This one proves the
   * hash function itself still produces the value the eval reports have been
   * recording. A change to `bandAnchorsHash()`'s own canonical form (the
   * separator, the ordering, the digest length) leaves the anchor text
   * untouched and passes the test above, while making every historical report's
   * anchors field incomparable with every future one, which is the single thing
   * that field exists to allow.
   */
  it("still hashes to the value written into every eval report", () => {
    expect(
      bandAnchorsHash(BAND_ANCHORS),
      "The band anchors hash has changed. If the anchor text above is unchanged, then bandAnchorsHash() itself changed, and every eval report written before now (test/eval/.output/) can no longer be compared against one written after. Spec 0017 AC-9 relies on that comparison.",
    ).toBe(HASH_AS_WRITTEN);
  });
});
