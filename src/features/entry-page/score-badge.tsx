import type { ReactNode } from "react";

import { Text } from "@/components/ui/text";
import { tv } from "@/components/ui/tv";

/**
 * The amber score pill (spec 0006, the hero card and the reasoning comparison).
 *
 * WHY IT IS ITS OWN THING AND NOT A `Chip`. `Chip` encodes the matched versus
 * missing grammar at skill scale, and draws its own check or gap icon to do it.
 * A score is neither: it is the one place `--accent-300` is allowed, which
 * `globals.css` states as "the score, and nothing else". Two callers on this
 * page render it (the hero result card and the JobHunt comparison card), so it
 * is a module rather than a class list copied twice.
 *
 * MONO, BECAUSE IT IS A MEASURED VALUE (spec 0005, AC-6, which names scores in
 * the mono list). It routes through `Text` at the `monoLabel` register rather
 * than composing font classes by hand, and overrides only the size and the
 * colour, which is what the configured `tv` in `src/components/ui/tv.ts` exists
 * to make safe: without it the size would be filed as a colour and one of the
 * two silently dropped.
 *
 * SIZES COME FROM THE LOCKED SCALE. The prototype set 22px here and 44px in the
 * comparison card; neither is on spec 0005's scale, so this takes `text-h3` and
 * `text-h2` instead. The scale is closed on purpose (spec 0005, AC-2).
 */
const scoreBadge = tv({
  base: "bg-accent-300 font-semibold text-ink",
  variants: {
    size: {
      /** Beside the match bar inside a result card. */
      card: "rounded-md px-2 py-0.5 text-h3",
      /**
       * The headline figure of the reasoning comparison. Same radius as `card`
       * on purpose: radius follows what the object IS, not how big it is
       * (`ui-registry.md`). Only the size and the padding change.
       */
      compare: "rounded-md px-3 py-1 text-h2",
    },
  },
  defaultVariants: {
    size: "card",
  },
});

type ScoreBadgeProps = {
  readonly children: ReactNode;
  readonly size?: "card" | "compare";
};

/**
 * A match score, rendered as the page's one amber accent.
 *
 * Renders a `span`, so the caller decides the block context. It carries no
 * accessible name of its own: the figure it sits in is already labelled, and
 * the `MatchBar` beside it announces the same proportion in words.
 */
export function ScoreBadge({ children, size = "card" }: ScoreBadgeProps) {
  return (
    <Text as="span" variant="monoLabel" className={scoreBadge({ size })}>
      {children}
    </Text>
  );
}
