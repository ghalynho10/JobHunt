import type { ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";

import { tv } from "./tv";

import { CheckIcon, GapIcon } from "./icons";

/**
 * The fill versus outline grammar at chip scale (spec 0005, AC-15;
 * `brand-tokens.md` calls this the signature element).
 *
 * Filled teal with a check means matched. Outline with a dashed circle means
 * missing, and never red: a gap is information about a job, not a mistake the
 * reader made. The icon is rendered by the chip rather than passed in, so the
 * grammar cannot drift one chip at a time.
 *
 * `status` collapses the three separately written "SOON" badges the composition
 * review found into one definition. It is a decorative label, so it is sans
 * tracked caps, not mono (AC-6).
 */
const chip = tv({
  base: "inline-flex items-center gap-1.5 font-sans font-medium",
  variants: {
    state: {
      matched:
        "rounded-md bg-primary-300 px-2.5 py-1 text-small text-primary-800",
      missing:
        "rounded-md border border-line bg-surface px-2.5 py-1 text-small text-muted",
      /**
       * Quieter than the other two: it annotates a control it sits beside
       * rather than standing as its own item. It is quieter by weight and
       * padding, NOT by size: it takes `text-caption`, the smallest step on the
       * locked scale, rather than an arbitrary value. An off scale `text-[Npx]`
       * here would be the design system breaking the rule it exists to enforce,
       * and `tv.test.ts` cannot catch one (it guards size against colour, not
       * arbitrary values). Same radius as the other two states, because radius
       * follows the kind of object. See `ui-registry.md`.
       */
      status:
        "rounded-md border border-line px-1.5 py-0.5 text-caption uppercase tracking-[0.06em] text-muted",
    },
  },
  defaultVariants: {
    state: "matched",
  },
});

type ChipProps = VariantProps<typeof chip> & {
  readonly children: ReactNode;
  readonly className?: string;
};

/**
 * A skill chip, or a status badge.
 *
 * Colour never carries the state on its own: `matched` and `missing` each
 * render their own icon, so the two are told apart by shape under colour vision
 * differences and in a forced palette, where the teal fill is discarded.
 */
export function Chip({ state = "matched", className, children }: ChipProps) {
  return (
    <span className={chip({ state, className })}>
      {state === "matched" ? <CheckIcon /> : undefined}
      {state === "missing" ? <GapIcon /> : undefined}
      {children}
    </span>
  );
}
