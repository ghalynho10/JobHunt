/**
 * Every sentence the reader sees on a scored result (spec 0015, `## Copy`).
 *
 * APPROVED BY THE ENGINEER AND USED VERBATIM, mirroring
 * `src/features/search/copy.ts` and `src/lib/usage-gating/copy.ts`: a change
 * here is a spec change first, not an edit.
 *
 * THE FIVE GATE REFUSAL SENTENCES ARE NOT HERE. They belong to feature 10 and
 * live in `src/lib/usage-gating/copy.ts`'s `SENTENCES` map, keyed by the reason
 * `checkUsageGate()` returned. This feature renders one of them verbatim at
 * page level (AC-11) and writes no copy of its own for them.
 *
 * THE BAND ANCHOR DESCRIPTIONS ARE NOT HERE EITHER. Those go to the model, not
 * to the reader, and they live beside the band order in `rubric.ts` so the
 * wording the model is anchored against cannot drift from the order the sort
 * depends on. What is here is the label a reader sees for a band, which is a
 * different string with a different audience.
 */
export const SCORING_COPY = {
  /**
   * `COPY-1`. The five band badges, in the rubric's own order.
   *
   * KEYED BY BAND NAME RATHER THAN LISTED, so a band can never render the label
   * of its neighbour through an off by one. `rubric.ts` owns the order; this
   * owns only what each one is called.
   */
  bands: {
    strong_match: "Strong match",
    good_match: "Good match",
    possible_match: "Possible match",
    weak_match: "Weak match",
    not_a_match: "Not a match",
  },
  /**
   * The matched skills heading. NOT IN SPEC 0015'S COPY TABLE, which defines
   * only the "not mentioned" side, because that is the side whose wording the
   * spec had to constrain. This is its mirror, written to the same standard:
   * both headings name the posting rather than the skill, so neither claims
   * more than the visible 500 characters can support.
   */
  matchedHeading: "Matched in this posting",
  /**
   * `COPY-2`. The `notMentionedSkills` heading and its caption (AC-5).
   *
   * NEITHER STRING MAY EVER READ "MISSING" (AC-5, and a key invariant of spec
   * 0015). Adzuna returns 500 characters of a posting, never the whole thing,
   * so the app cannot tell a skill the posting does not want from a skill the
   * posting wants and did not fit in the excerpt. The caption is not a
   * disclaimer bolted on: it is the only thing making the heading above it
   * true.
   */
  notMentionedHeading: "Not mentioned in this posting",
  notMentionedCaption:
    "This posting only shows part of the description, so this is not a confirmed gap.",
  /**
   * `COPY-3`. The per card failure state (AC-10).
   *
   * ONE CARD'S SENTENCE, NEVER THE PAGE'S. A vendor error on one listing says
   * nothing about the other nineteen, and this feature's whole point is that a
   * failure is visible rather than dressed as a low score. It names no vendor
   * and no technical cause, matching `SEARCH_COPY.searchFailed`'s own reasoning.
   */
  couldNotScore: "Could not score this listing right now.",
  /** `COPY-4`. The pending indicator on an unresolved card. */
  pending: "Checking fit against your profile…",
  /**
   * `COPY-5`. The zero profile gate (AC-7).
   *
   * IT SAYS WHAT TO DO, NOT WHAT WENT WRONG, because nothing went wrong: a
   * profile with no skills and no work history is an ordinary starting state,
   * and scoring against it would invent a judgment from nothing. The link to
   * `/profile` is rendered by the caller; this is the sentence around it.
   */
  thinProfile:
    "Add your skills or work experience to your profile to see how well each listing fits.",
  /** The link text inside `COPY-5`'s sentence. */
  thinProfileLink: "your profile",
  /**
   * NOT IN SPEC 0015'S COPY TABLE. Added during the build, for the reason
   * `SEARCH_COPY.prefillFailed` and `SEARCH_COPY.appliedReadFailed` were each
   * added to their own feature: the spec named the state where the profile is
   * empty (`COPY-5`) and the state where the vendor call broke (`COPY-3`), and
   * left the state where the profile itself could not be READ with no sentence
   * of its own.
   *
   * WITHOUT IT, A DATABASE OUTAGE RENDERS ONE OF THE OTHER TWO SCREENS. Falling
   * back to `COPY-5` tells somebody with a full profile to go and fill it in;
   * falling back to an unscored list with no message at all says the search
   * simply does not score, which is the default that reads like success this
   * project's own rule forbids.
   *
   * It says the results are still usable, because they are: the failure costs
   * the scoring and nothing else.
   */
  profileReadFailed:
    "We couldn't read your profile just now, so these listings aren't scored. Nothing you did caused this. The results below still work.",
  /**
   * `COPY-6`. The two sponsorship badges (AC-6). `not_stated` renders neither,
   * which is why this map has two entries and the enum has three: an absent
   * badge is the whole rendering of a posting that said nothing about visas,
   * and a third sentence would be this feature claiming the posting was silent
   * on purpose.
   */
  sponsorship: {
    sponsors: "Sponsors work visas",
    does_not_sponsor: "Does not sponsor work visas",
  },
  /**
   * `COPY-7`. The one time re-sort announcement (AC-16), read by a screen
   * reader when the list stops being in Adzuna's order and starts being in
   * fit order. Said once, because it happens once.
   */
  reranked: "Results are now ranked by fit.",
} as const;
