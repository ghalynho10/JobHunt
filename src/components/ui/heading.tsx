import type { ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";

import { tv } from "./tv";

/**
 * The three heading sizes of the locked type scale (spec 0005, AC-2).
 *
 * Level and size are one choice on purpose: the scale in `brand-tokens.md` is
 * ratio 1.25 and closed, so there is no size a caller could want that is not one
 * of these three. Sizes, line heights and tracking all come from the `@theme`
 * block in `globals.css`; nothing is restated here.
 */
const heading = tv({
  base: "font-sans text-ink text-balance",
  variants: {
    level: {
      /** Display, `clamp(2.5rem, 5vw, 4rem)`. One per page. */
      1: "text-display font-semibold",
      2: "text-h2 font-semibold",
      3: "text-h3 font-medium",
    },
  },
  defaultVariants: {
    level: 2,
  },
});

type HeadingProps = VariantProps<typeof heading> & {
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * Renders a different tag than the size implies, for the case where the
   * document outline and the visual weight genuinely disagree (a section that
   * must be an `h2` but should read quietly). Use it rarely: by default the
   * level is both.
   */
  readonly as?: "h1" | "h2" | "h3" | "h4";
};

/**
 * A heading at one of the three scale steps.
 *
 * Server component. `text-balance` is on by default because every heading here
 * is short enough for the browser to balance cheaply, and a two line heading
 * breaking one word onto its own line is the most common visual defect on a
 * responsive page.
 */
export function Heading({ level = 2, as, className, children }: HeadingProps) {
  const Component = as ?? (`h${level}` as const);

  return (
    <Component className={heading({ level, className })}>{children}</Component>
  );
}
