import type { ReactNode } from "react";
import { tv, type VariantProps } from "tailwind-variants";

/**
 * The two container idioms (spec 0005, AC-3), and only two.
 *
 * The composition review found one container shape repeated everywhere, so
 * nothing on the page could be more important than anything else. The split
 * fixes that by making weight a choice the caller has to make:
 *
 * - `elevated` is shadow led. Its boundary is the shadow, which is why it can
 *   sit on `surface` (`#FFFFFF`) over `paper` (`#FFFAFB`) despite that being
 *   only a 1% lightness gap: the fill was never doing the separating.
 * - `flat` is border led. It takes `paper` so it disappears into a `paper`
 *   section and lifts out of a `sunken` one, with the hairline doing the work
 *   either way (AC-3, and the `sunken` half of the rule spec 0005 states).
 *
 * A card never mixes them. Shadow plus border together is the shape the review
 * flagged, and it is what the `no-restricted-syntax` rule in `eslint.config.mjs`
 * now catches outside this directory.
 */
const card = tv({
  base: "rounded-2xl p-6 sm:p-7",
  variants: {
    tone: {
      /**
       * Two shadows, not one: a 1px contact shadow so the edge reads at rest,
       * and a wide soft shadow for the lift. `border-line/25` is a hint, not a
       * border led idiom.
       */
      elevated: [
        "bg-surface border border-line/25",
        "shadow-[0_1px_2px_rgba(26,26,26,0.04),0_12px_32px_-16px_rgba(26,26,26,0.18)]",
      ],
      flat: "bg-paper border border-line",
    },
  },
  defaultVariants: {
    tone: "flat",
  },
});

type CardProps = VariantProps<typeof card> & {
  readonly children: ReactNode;
  readonly className?: string;
  /**
   * Renders a different element than `div` where the card is a real landmark:
   * `article` for a job result, `section` for a titled block.
   */
  readonly as?: "div" | "article" | "section" | "li";
};

function CardRoot({
  tone,
  as: Component = "div",
  className,
  children,
}: CardProps) {
  return (
    /**
     * `forced-colors:border-[CanvasText]` on both tones. In a forced palette the
     * shadow is discarded, so an elevated card would lose its only boundary; a
     * system coloured border is the one thing that survives.
     */
    <Component
      className={card({
        tone,
        className: `forced-colors:border forced-colors:border-[CanvasText] ${className ?? ""}`,
      })}
    >
      {children}
    </Component>
  );
}

type SlotProps = {
  readonly children: ReactNode;
  readonly className?: string;
};

/**
 * The card's title area. Spacing only: the card root owns the padding, so a
 * slot never adds a second inset that would make one card read as under padded
 * next to another.
 */
function CardHeader({ className, children }: SlotProps) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>{children}</div>
  );
}

/** The card's content. Spaced from the header, not padded independently. */
function CardBody({ className, children }: SlotProps) {
  return <div className={`mt-4 ${className ?? ""}`}>{children}</div>;
}

type CardFooterProps = SlotProps & {
  /**
   * The attribution slot (spec 0005, AC-10). Feature 11 fills it with the real
   * Adzuna "Jobs by Adzuna" block, which Adzuna's terms require on every
   * displayed advert at no less than 116 by 23 pixels. This feature builds only
   * the mechanism, so the slot takes any node and guarantees the layout.
   */
  readonly attribution?: ReactNode;
};

/**
 * The card's action row, with an optional attribution beside the action.
 *
 * Stacked below `sm` and a `justify-between` row above it. It stacks rather
 * than wrapping in place because the attribution has a licensed minimum size:
 * a wrapping row would compress it below 116 by 23 pixels on a narrow phone
 * before it ever wrapped, which would breach the terms rather than just look
 * cramped. `shrink-0` holds that floor in the row layout too.
 */
function CardFooter({ attribution, className, children }: CardFooterProps) {
  return (
    <div
      className={`mt-6 flex flex-col items-start gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center gap-4">{children}</div>
      {attribution === undefined ? undefined : (
        <div className="shrink-0">{attribution}</div>
      )}
    </div>
  );
}

/**
 * A container in one of the two sanctioned idioms, with its header, body and
 * footer slots.
 *
 * The slots are attached in a single `Object.assign` expression rather than by
 * assigning properties afterwards, so the exported binding is complete the
 * moment it exists and nothing mutates a shared value later.
 */
export const Card = Object.assign(CardRoot, {
  Header: CardHeader,
  Body: CardBody,
  Footer: CardFooter,
});
