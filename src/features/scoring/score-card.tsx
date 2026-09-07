import { Chip } from "@/components/ui/chip";
import { Text } from "@/components/ui/text";
import { isFailure } from "@/lib/result";

import { BandBadge } from "./band-badge";
import { SCORING_COPY } from "./copy";
import type { ScoreOutcome } from "./score";

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
  readonly outcome: ScoreOutcome | "pending";
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
  if (isFailure(outcome)) {
    return (
      <Text variant="monoLabel" className="mt-4 block">
        {SCORING_COPY.couldNotScore}
      </Text>
    );
  }

  /** AC-11: the page says this once, above the list. Nothing on the card. */
  if (!outcome.value.allowed) return undefined;

  const score = outcome.value.value;

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

      {score.matchedSkills.length === 0 ? undefined : (
        <div className="mt-4">
          <Text variant="eyebrow" className="text-secondary">
            {SCORING_COPY.matchedHeading}
          </Text>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {score.matchedSkills.map((skill) => (
              <Chip key={skill} state="matched">
                {skill}
              </Chip>
            ))}
          </div>
        </div>
      )}

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
      <Text variant="monoData" className="mt-4">
        <span className="text-primary-600">{"//"}</span> {score.reasoning}
      </Text>
    </div>
  );
}
