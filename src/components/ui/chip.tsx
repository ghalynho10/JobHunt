import type { ReactNode } from "react";

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
 *
 * `editable` (spec 0023, AC-9) is a fourth, additive state for a chip built by
 * typing rather than derived from a match: no icon, an outline like `missing`
 * so it reads as a plain entry rather than a verdict, and room on the right for
 * the `action` slot below.
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
      /**
       * A chip built by typing, not by matching against anything, so it takes
       * no verdict icon. `pl-2.5 pr-1` leaves the left side matched to the other
       * states' padding while the right side makes room for the fixed 24 by 24
       * remove control (step 2's own sizing, not this padding) without the chip
       * growing taller than it needs to.
       */
      editable:
        "rounded-md border border-line bg-surface py-1 pl-2.5 pr-1 text-small text-ink",
    },
  },
  defaultVariants: {
    state: "matched",
  },
});

type ChipCommon = {
  readonly children: ReactNode;
  readonly className?: string;
};

/**
 * The verdict shapes: no remove control, because nothing here was typed in and
 * nothing here can be taken back by the reader.
 */
type ChipAsVerdict = ChipCommon & {
  readonly state?: "matched" | "missing" | "status";
  readonly action?: never;
  readonly pendingRemoval?: never;
};

/**
 * The typed shape (spec 0023, AC-9). `action` and `pendingRemoval` are only
 * reachable here, the same discriminated union shape `button.tsx`'s
 * `ButtonAsLink` already uses for `disabled` and `type`: a call site cannot
 * pass an `action` to a `matched` or `missing` chip and accidentally render a
 * remove control beside a verdict.
 */
type ChipAsEditable = ChipCommon & {
  readonly state: "editable";
  /**
   * The remove control, rendered as given. Handler free: `Chip` stays a server
   * component (`src/components/ui/AGENTS.md` line 7), so the control that
   * removes the chip is built and wired by the client caller, `chip-field.tsx`,
   * never by this file.
   */
  readonly action?: ReactNode;
  /**
   * Marks this chip pending removal (spec 0023, AC-10): a visible, shape based
   * change, never colour alone, matching this design system's own dashed
   * versus solid grammar (`GapIcon`'s dashed stroke already means "not
   * settled yet"). Cannot be `true` without `action` also set, so a pending
   * state can never exist on a chip with no control to act on it.
   */
  readonly pendingRemoval?: boolean;
};

type ChipProps = ChipAsVerdict | ChipAsEditable;

/**
 * A skill chip, a status badge, or a typed, removable entry.
 *
 * Colour never carries the state on its own: `matched` and `missing` each
 * render their own icon, so the two are told apart by shape under colour vision
 * differences and in a forced palette, where the teal fill is discarded.
 * `editable` carries its own distinction the same way, by an outline and a
 * visible remove control rather than by colour.
 */
export function Chip(props: ChipProps) {
  const { className, children } = props;
  const state = props.state ?? "matched";
  const pending = props.state === "editable" && props.pendingRemoval === true;

  return (
    <span
      className={chip({
        state,
        class: [className, pending ? "border-dashed border-ink" : undefined]
          .filter((value) => value !== undefined)
          .join(" "),
      })}
    >
      {state === "matched" ? <CheckIcon /> : undefined}
      {state === "missing" ? <GapIcon /> : undefined}
      {children}
      {props.state === "editable" ? props.action : undefined}
    </span>
  );
}
