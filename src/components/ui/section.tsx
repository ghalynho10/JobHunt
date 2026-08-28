import type { ReactNode } from "react";
import type { VariantProps } from "tailwind-variants";

import { tv } from "./tv";

/**
 * Page rhythm, background alternation and the divider rule in one place
 * (spec 0005, AC-4, AC-5, AC-8).
 *
 * The composition review found `py-20` on every section regardless of what it
 * held, which flattened the page into a list of equally important blocks, and a
 * hairline rule used as the only separator anywhere. Both are fixed here rather
 * than per page:
 *
 * - `weight` picks one of three rhythms. Each is a responsive pair defined in
 *   `globals.css`, so `py-section-standard` is already 20 on a phone and 24 at
 *   `sm` with one class.
 * - `background` alternates `paper` and `surface-sunken`. The sunken token
 *   exists because the old `paper` to `surface` alternation was a 1% lightness
 *   gap, which separates nothing; this one is about 3.5% and actually reads.
 * - `divider` is set by the caller, per the adjacency rule below.
 */
const section = tv({
  base: "w-full",
  variants: {
    weight: {
      compact: "py-section-compact",
      standard: "py-section-standard",
      generous: "py-section-generous",
    },
    background: {
      paper: "bg-paper",
      sunken: "bg-surface-sunken",
    },
    divider: {
      /**
       * The one place a hairline still earns its keep. `forced-colors` keeps it,
       * because in a forced palette the background alternation is discarded and
       * the rule becomes the only separator left.
       */
      hairline: "border-t border-line forced-colors:border-[CanvasText]",
      none: "",
    },
  },
  defaultVariants: {
    weight: "standard",
    background: "paper",
    divider: "none",
  },
});

type SectionProps = VariantProps<typeof section> & {
  readonly children: ReactNode;
  readonly className?: string;
  /** Anchor target, for an in page link such as a "get started" jump. */
  readonly id?: string;
  /**
   * Names the section for assistive technology when its own heading does not,
   * or when two sections would otherwise be indistinguishable in a landmark
   * list.
   */
  readonly label?: string;
};

/**
 * A full bleed page section with a contained content column.
 *
 * THE ADJACENCY RULE (spec 0005, AC-5), which this component cannot enforce for
 * you because it cannot see its siblings: two adjacent sections with the SAME
 * `background` take `divider="hairline"`; two with DIFFERENT backgrounds take
 * `divider="none"`, because the change in background is already the separation
 * and drawing a line as well double states it.
 *
 * The background spans the viewport while the content stays in a measured
 * column, which is why there are two elements here rather than one.
 */
export function Section({
  weight,
  background,
  divider,
  id,
  label,
  className,
  children,
}: SectionProps) {
  return (
    <section
      id={id}
      aria-label={label}
      className={section({ weight, background, divider, className })}
    >
      <div className="mx-auto w-full max-w-6xl px-6">{children}</div>
    </section>
  );
}
