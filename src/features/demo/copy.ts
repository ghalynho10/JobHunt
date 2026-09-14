/**
 * Every sentence `/demo` shows that is not a seeded value (spec 0021).
 *
 * ONE MODULE, SO THE PAGE'S CLAIMS ARE READABLE IN ONE PLACE. This feature's
 * whole premise is that nothing on the page misleads, and the three sentences
 * below are the ones carrying that: what the data is, what the apply control
 * would do, and what happened when the read failed. Scattered through the JSX
 * they could each drift on their own.
 *
 * The scoring copy this page also uses is NOT restated here. The card reads
 * `SCORING_COPY.notMentionedHeading` and `.notMentionedCaption` from
 * `src/features/scoring/copy.ts` verbatim, because a demo of the real product
 * that reworded the real product's most carefully worded caption would be
 * demonstrating something this app does not do.
 */
export const DEMO_COPY = {
  /**
   * AC-10, and the load bearing sentence on the page. It says both halves of
   * the truth: the results are samples, and the listings are fictional. Either
   * half alone leaves a reader able to believe the other is real.
   */
  banner:
    "Sample results, not live postings. Every listing on this page is fictional and was prepared in advance.",

  /**
   * AC-8, where `ApplyControl` sits on the real card.
   *
   * PLAIN TEXT, NEVER A DISABLED BUTTON. A disabled control invites a click,
   * fails silently when it gets one, and is skipped by some screen readers'
   * control listings, so the reader is told nothing three different ways. A
   * sentence says what the real page does instead.
   */
  applyUnavailable: "Applying is available once you sign in.",

  /**
   * AC-12. The page answers a normal 200 and says this, rather than rendering
   * an empty list that reads like a product with no results in it.
   */
  readFailed: "The sample results couldn't be loaded right now.",

  /** The switcher's group label, for a screen reader's landmark listing. */
  personaSwitcherLabel: "Example candidate profile",
} as const;
