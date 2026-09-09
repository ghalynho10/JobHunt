import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { isFailure } from "@/lib/result";

import { BandBadge } from "./band-badge";
import { SCORING_COPY } from "./copy";
import type { ListingOutcome } from "./score-listings";

/**
 * The scoring block on one result card (spec 0015, AC-5, AC-6, AC-10, AC-11).
 *
 * IT RENDERS EVERY STATE THIS FEATURE HAS, from one prop, so no caller can
 * assemble a state this file has not thought about. There are four, and three
 * of them look different on purpose:
 *
 * - `"pending"`: the call is still out. `COPY-4`.
 * - a failure: this listing alone broke. `COPY-3` (AC-10).
 * - a refusal: the usage cap stopped the batch. NOTHING HERE (AC-11); the page
 *   says it once above the list instead.
 * - a score: the band, the two skill lists, the reasoning, the sponsorship.
 *
 * SPEC 0019 ADDS A SECOND AXIS INSIDE THAT LAST ONE, and it multiplies rather
 * than replaces: every scored card is additionally clean, flagged, or
 * unverifiable (AC-7). The three are told apart by the TYPE of
 * `outcome.check`, never by a convention:
 *
 * - clean, or either skip: nothing extra renders (AC-8). A check that was
 *   never needed must not look like a check that broke.
 * - flagged: each ungrounded skill leaves the displayed matched list, `COPY-9`
 *   names what went, and `COPY-11` sits above the reasoning (AC-13).
 * - unverifiable: `COPY-10` renders and NOTHING ELSE CHANGES. The matched
 *   list stays exactly as scored.
 *
 * THE BAND NEVER MOVES IN ANY OF THEM (AC-12). It is chosen before a check
 * outcome exists and this file never revisits it, so a card can lose every
 * chip it had and keep its band. That is the honest reading: an excerpt
 * failing to confirm a claim is a limit of the excerpt, not a re-scoring of
 * the job.
 *
 * THE REFUSAL RENDERING NOTHING IS THE SUBTLE ONE, and it is a requirement
 * rather than an omission. A cap reached is one fact about the whole render,
 * not twenty facts about twenty listings; repeating it per card would bury the
 * one thing the reader can act on under nineteen copies of itself, and would
 * read as twenty separate things having gone wrong. Spec 0012's own invariant,
 * that a refusal and a failure are never the same shape, is what makes telling
 * these two apart possible at all.
 */
export function ScoreCard({
  outcome,
}: {
  readonly outcome: ListingOutcome | "pending";
}) {
  if (outcome === "pending") {
    return (
      <Text variant="monoLabel" className="mt-4 block">
        {SCORING_COPY.pending}
      </Text>
    );
  }

  /**
   * AC-10. NO `role="alert"`, and that is deliberate rather than an oversight
   * of this project's own convention. Up to twenty of these can render in one
   * response, and twenty simultaneous assertive announcements is not twenty
   * times as useful as one, it is a screen reader talking over itself for a
   * minute. The sentence is visible, in reading order, on the card it belongs
   * to, and the failure itself is already reported to Sentry by `failure()` at
   * the point it happened. The page level notices around the list keep their
   * `role="alert"`, because there is only ever one of each.
   */
  if (isFailure(outcome.score)) {
    return (
      <Text variant="monoLabel" className="mt-4 block">
        {SCORING_COPY.couldNotScore}
      </Text>
    );
  }

  /** AC-11: the page says this once, above the list. Nothing on the card. */
  if (!outcome.score.value.allowed) return undefined;

  const score = outcome.score.value.value;
  const { check } = outcome;

  /**
   * Spec 0019, AC-7 and AC-8: which of the three check states this card is in.
   *
   * BOTH SKIP VARIANTS FALL OUT AS NEITHER FLAGGED NOR UNVERIFIABLE, which is
   * AC-8 stated as code rather than as a comment. A listing that claimed no
   * skills and a listing whose check timed out must not render alike: the
   * first had nothing to check, and saying anything about it would invent a
   * problem. The string variants are caught first precisely so a later reader
   * cannot mistake them for a `Result`.
   */
  const isSkip = check === "skipped_no_score" || check === "skipped_no_skills";
  const unverifiable = !isSkip && (isFailure(check) || !check.value.allowed);
  const flaggedSkills =
    isSkip || isFailure(check) || !check.value.allowed
      ? []
      : check.value.value.ungroundedSkills;

  /**
   * AC-7's flagged state, computed at render over the RAW score, which is
   * never mutated (spec 0019, key invariants, and this project's store raw
   * rule applied to an in memory value).
   *
   * AN EXACT STRING COMPARISON IS CORRECT HERE AND NOT A SHORTCUT.
   * `checkFitScore()` already put every name it returns through
   * `keepOwnNames()` against this very `matchedSkills` array (AC-3), so a
   * flagged name is byte for byte one of these strings. Matching loosely
   * again here would be a second, weaker rule layered over a settled one, and
   * it could remove a chip the check never named.
   */
  const flagged = new Set(flaggedSkills);
  const matchedSkills = score.matchedSkills.filter(
    (skill) => !flagged.has(skill),
  );

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        <BandBadge band={score.band} />

        {/*
         * AC-6: its own separate badge, never folded into the band. The
         * sponsorship signal is not an input to the band and must not read like
         * one, which is what a single combined pill would imply. `not_stated`
         * renders neither of the two sentences, which is the same visible
         * outcome an absent field would have had, reached from an explicit
         * value the model had to choose rather than from a field it forgot.
         */}
        {score.sponsorshipSignal === "not_stated" ? undefined : (
          <Chip state="status">
            {SCORING_COPY.sponsorship[score.sponsorshipSignal]}
          </Chip>
        )}
      </div>

      {matchedSkills.length === 0 ? undefined : (
        <div className="mt-4">
          <Text variant="eyebrow" className="text-secondary">
            {SCORING_COPY.matchedHeading}
          </Text>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {matchedSkills.map((skill) => (
              <Chip key={skill} state="matched">
                {skill}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {/*
       * `COPY-9`, AC-7. It sits directly under the matched list because it is
       * about that list, and it renders EVEN WHEN THE LIST IS NOW EMPTY, which
       * is the case that matters most: a card whose every claimed skill was
       * flagged shows no chips at all, and this sentence is then the only
       * thing on screen saying why. Dropping it there would leave the reader
       * with a card that silently lost a section.
       *
       * NO `role="alert"`, on `COPY-3`'s own reasoning: up to twenty of these
       * can render in one response, and twenty assertive announcements is a
       * screen reader talking over itself. It is visible, in reading order, on
       * the card it belongs to.
       */}
      {flaggedSkills.length === 0 ? undefined : (
        <Text variant="muted" className="mt-3 block">
          {SCORING_COPY.removedSkills(flaggedSkills)}
        </Text>
      )}

      {/*
       * `COPY-10`, AC-7. The check was attempted and did not finish, so this
       * card says so rather than presenting an unchecked list as a checked
       * one. The matched skills above are untouched, which is the whole
       * difference between this state and the flagged one.
       */}
      {unverifiable ? (
        <Text variant="muted" className="mt-3 block">
          {SCORING_COPY.couldNotCheck}
        </Text>
      ) : undefined}

      {score.notMentionedSkills.length === 0 ? undefined : (
        <div className="mt-4">
          {/*
           * AC-5, and the one label in this feature that cannot be reworded
           * casually. Adzuna returns 500 characters of a posting, so the app
           * cannot tell a skill this posting does not want from a skill it
           * wants further down text nobody was shown. "Missing" would claim the
           * first; the heading claims only that the excerpt did not mention it,
           * and the caption underneath says why that is not the same thing.
           *
           * THE CAPTION IS NOT OPTIONAL POLISH. Without it the heading is a
           * near synonym for "missing" and the honesty is only in the schema's
           * field name, where no reader will ever see it.
           */}
          <Text variant="eyebrow" className="text-secondary">
            {SCORING_COPY.notMentionedHeading}
          </Text>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {score.notMentionedSkills.map((skill) => (
              <Chip key={skill} state="missing">
                {skill}
              </Chip>
            ))}
          </div>
          <Text variant="muted" className="mt-2">
            {SCORING_COPY.notMentionedCaption}
          </Text>
        </div>
      )}

      {/*
       * The written reasoning, in the register spec 0005 reserves for it:
       * `monoData` is "written explanation the reader has to actually read",
       * and it takes `--secondary` rather than `--muted` for that reason. The
       * teal comment marker matches the entry page's own example card, which is
       * the shape this screen is the real version of.
       */}
      {/*
       * `COPY-11`, AC-13. A SEPARATE ELEMENT ABOVE THE REASONING, NEVER
       * SPLICED INTO IT. The reasoning string is the model's own words and is
       * rendered byte for byte as it was scored; editing it to remove a
       * mention of a flagged skill would put words in the model's mouth and
       * destroy the raw value this card is supposed to be showing.
       *
       * IT RENDERS ONLY ON A FLAGGED CARD. A clean check, an unverifiable
       * check and both skips add no caveat, because in none of those cases is
       * there a contradiction between the chips and the prose to explain.
       */}
      {flaggedSkills.length === 0 ? undefined : (
        <Text variant="muted" className="mt-4 block">
          {SCORING_COPY.reasoningCaveat}
        </Text>
      )}

      <Text variant="monoData" className="mt-4">
        <span className="text-primary-600">{"//"}</span> {score.reasoning}
      </Text>
    </div>
  );
}
