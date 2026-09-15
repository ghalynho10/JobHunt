/**
 * Every sentence `/demo` shows that is not a stored value (spec 0021).
 *
 * ONE MODULE, SO THE PAGE'S CLAIMS ARE READABLE IN ONE PLACE. This feature's
 * whole premise is that nothing on the page misleads, and the sentences below
 * are the ones carrying that: what the data is, what is made up, what the apply
 * control would do, and what happened when there was nothing to show. Scattered
 * through the JSX they could each drift on their own.
 *
 * EVERY CLAIM HERE WAS REVERSED ON 2026-09-14. The old wording said the
 * listings were fabricated samples prepared in advance, which was true then and
 * is false now: the listings are real Adzuna postings and the scores are real
 * scoring calls. The two candidate profiles are the only made up thing left, so
 * the banner says that instead, and the page shows both profiles in full so the
 * claim can be checked rather than taken on trust.
 *
 * The scoring copy this page also uses is NOT restated here. The card reads
 * `SCORING_COPY.notMentionedHeading`, `.notMentionedCaption`, `.removedSkills`
 * and `.reasoningCaveat` from `src/features/scoring/copy.ts` verbatim, because
 * a demo of the real product that reworded the real product's most carefully
 * worded sentences would be demonstrating something this app does not do.
 */
export const DEMO_COPY = {
  /**
   * AC-10 and AC-14, and the load bearing sentence on the page. It says both
   * halves of the truth: the listings and their scores are real, and the two
   * candidates being scored are not. Either half alone leaves a reader able to
   * believe the wrong thing about the other.
   */
  banner:
    "These are real job postings from Adzuna, scored by the same code that scores a real search. The two candidates being scored are made up, and both of their profiles are shown in full below.",

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
   * AC-12. A genuine fault: the database is unreachable, or a row did not
   * parse. The page answers a normal 200 and says this, rather than rendering
   * an empty list that reads like a product with no results in it.
   */
  readFailed: "The demo results couldn't be loaded right now.",

  /**
   * AC-15, AND DELIBERATELY WORDED APART FROM `readFailed`. Nothing is broken:
   * the page simply has not been refreshed yet. A reader who sees the failure
   * sentence when nothing failed learns something false about the product, and
   * an engineer who sees it cannot tell a fresh deployment from an outage.
   */
  notRefreshedYet:
    "The demo hasn't been refreshed yet, so there are no listings to show. Nothing is broken; real results appear at the next refresh.",

  /** The switcher's group label, for a screen reader's landmark listing. */
  personaSwitcherLabel: "Example candidate profile",

  /** The heading over both candidates' full profiles (AC-14). */
  profilesHeading: "The two candidates, in full",

  /**
   * AC-14's disclosure, sitting with the profiles rather than in the banner.
   * The banner says the candidates are made up; this says what that means for
   * the scores beside them.
   */
  profilesCaption:
    "These two are invented, including the employers in their work history. Everything the app was given about them is here, so you can judge the scores against it.",

  /**
   * AC-16's cross persona line.
   *
   * IT NAMES THE OTHER CANDIDATE RATHER THAN SAYING "the other profile",
   * because the whole claim being demonstrated is that the score is about a
   * person. A pronoun would make the line read as a second opinion on the
   * posting instead of one person's result next to another's.
   */
  otherPersonaBand: (label: string, band: string): string =>
    `${label}: ${band}`,

  /** AC-14's line naming the search these listings answer. */
  searchedFor: (title: string, location: string | undefined): string =>
    location === undefined
      ? `These are the first results for a search for "${title}".`
      : `These are the first results for a search for "${title}" in ${location}.`,
} as const;
