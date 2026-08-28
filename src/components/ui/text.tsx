import type { ReactNode } from "react";
import { tv, type VariantProps } from "tailwind-variants";

/**
 * The register rule, as code (spec 0005, AC-6).
 *
 * The composition review found mono had stopped meaning anything, because it
 * was applied to everything label shaped or data shaped alike. `brand-tokens.md`
 * only ever earned mono on precision: written reasoning and literal data. So
 * the split this component enforces is:
 *
 * - Mono (`monoLabel`, `monoData`) is for what the product measured or wrote:
 *   salaries, dates, scores, skill gap notes, the summary line.
 * - Sans tracked caps (`eyebrow`) is for decoration: section openers, block
 *   micro labels ("Matched", "Missing"), step numerals, status badges.
 *
 * The two mono variants differ by length, not by register: `monoLabel` is a
 * short literal (a salary, a date), `monoData` is reasoning long enough to need
 * a reading line height.
 *
 * This retires the global `.eyebrow` and `.mono-label` CSS classes from
 * `brand-tokens.md`; both were mono, which is the conflation the review named.
 */
const text = tv({
  base: "",
  variants: {
    variant: {
      /** Section opener. Sans, tracked caps: decoration, so never mono. */
      eyebrow:
        "font-sans text-caption font-medium uppercase tracking-[0.08em] text-muted",
      /** A short literal the product measured: a salary, a date, a score. */
      monoLabel:
        "font-mono text-small font-medium tracking-[0.02em] text-muted",
      /**
       * The reasoning register: written explanation the reader has to actually
       * read, so it takes `--secondary` (8.59:1) rather than `--muted` (4.74:1)
       * and a reading line height.
       */
      monoData: "font-mono text-small leading-[1.6] text-secondary",
      /**
       * Running prose. Capped at 65ch per `brand-tokens.md`: a `max-width` only
       * ever caps, so this is safe inside a narrow card as well as a wide one.
       */
      body: "font-sans text-body text-ink max-w-[65ch]",
      /** Quiet supporting prose. Sans, because it is prose, not data. */
      muted: "font-sans text-small text-muted max-w-[65ch]",
    },
  },
  defaultVariants: {
    variant: "body",
  },
});

/** The elements `Text` may render as. Deliberately small: no arbitrary `as`. */
type TextElement = "p" | "span" | "div" | "li" | "dt" | "dd";

type TextProps = VariantProps<typeof text> & {
  readonly children: ReactNode;
  /**
   * Defaults to `p`. Use `span` inside a sentence and `li` inside a list, so
   * the register choice never forces the wrong element into the document
   * outline.
   */
  readonly as?: TextElement;
  readonly className?: string;
};

/**
 * Renders text in one of the system's five registers.
 *
 * Server component: it holds no state and takes no event handler, so it never
 * crosses the client boundary.
 */
export function Text({
  as: Component = "p",
  variant,
  className,
  children,
}: TextProps) {
  return (
    <Component className={text({ variant, className })}>{children}</Component>
  );
}
