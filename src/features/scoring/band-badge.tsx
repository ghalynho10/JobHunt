import { Text } from "@/components/ui/text";
import { tv } from "@/components/ui/tv";

import { SCORING_COPY } from "./copy";
import type { Band } from "./rubric";

/**
 * The band badge, one of five (spec 0015, `COPY-1`).
 *
 * WHY IT IS NOT `Chip`, AND NOT `ScoreBadge`. `Chip` encodes the matched versus
 * missing grammar at skill scale and draws its own check or gap icon to do it,
 * which is the wrong grammar for a five valued judgment: this feature uses
 * `Chip` for the skills below and needs something the eye does not read as one
 * more skill. `ScoreBadge` in `src/features/entry-page/` is a numeric ratio
 * pill with two sizes and no concept of a band, and it belongs to another
 * feature's folder, which the folder by feature rule in `AGENTS.md` keeps this
 * one out of. When a second feature genuinely needs a band badge, this is the
 * module that moves to `src/components/`, and `/sync` is where that call gets
 * made.
 *
 * MONO, BECAUSE A BAND IS A MEASURED VALUE (spec 0005, AC-6, which names scores
 * in the mono list). It routes through `Text` at the `monoLabel` register
 * rather than composing font classes by hand, and overrides only the colour and
 * the box, exactly as `ScoreBadge` does and for the same reason: the configured
 * `tv` in `src/components/ui/tv.ts` is what stops a size being filed as a
 * colour and one of the pair silently dropped.
 *
 * THE COLOUR NEVER CARRIES THE BAND ON ITS OWN. Each badge says which band it
 * is in words, so the five stay distinguishable under colour vision
 * differences, in a forced palette where the fill is discarded entirely, and to
 * a screen reader, which is this project's WCAG 2.2 AA floor (`AGENTS.md`).
 * The ramp below is emphasis, not information.
 *
 * IT STAYS INSIDE THE AMBER RAMP RATHER THAN INVENTING A FIVE COLOUR SCALE.
 * `globals.css` reserves amber for the score and nothing else, and a band IS
 * this product's score, so the three bands worth acting on take the accent at
 * three weights and the two that are not fall back to the same quiet outline
 * every other neutral object on the page uses. Reaching for green and red here
 * would add two meanings to the palette that spec 0005 never defined, and would
 * put a red badge on a listing for the ordinary outcome of not being a fit,
 * which is the same mistake `Chip`'s missing state exists to avoid: a gap is
 * information about a job, not a mistake the reader made.
 */
const bandBadge = tv({
  base: "inline-flex items-center rounded-md px-2.5 py-1 text-small",
  variants: {
    band: {
      strong_match: "bg-accent-300 font-semibold text-ink",
      good_match: "bg-accent-200 font-semibold text-ink",
      possible_match: "bg-accent-100 font-medium text-ink",
      weak_match: "border border-line bg-surface font-medium text-secondary",
      not_a_match: "border border-line bg-surface font-medium text-muted",
    },
  },
});

/**
 * A fit band, rendered as this card's headline judgment.
 *
 * Renders a `span`, so the caller decides the block context. It carries no
 * accessible name of its own: the band's label is its own text content, which
 * is the whole thing a screen reader needs to read out.
 */
export function BandBadge({ band }: { readonly band: Band }) {
  return (
    <Text as="span" variant="monoLabel" className={bandBadge({ band })}>
      {SCORING_COPY.bands[band]}
    </Text>
  );
}
