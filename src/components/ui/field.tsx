import type { ReactNode } from "react";

import { GapIcon } from "./icons";
import { tv } from "./tv";

/**
 * The label and layout wrapper every form control sits in (spec 0010, AC-17).
 *
 * WHAT IT DOES NOT OWN: the error message. That is rendered by the control
 * itself (`Input`, `Textarea`, `Select`), from the control's own `error` prop,
 * and this is the load bearing part of the split rather than an accident of
 * where the markup landed.
 *
 * A validation error has two halves that must agree: the sentence a sighted
 * reader sees, and the `aria-invalid` plus `aria-describedby` pair a screen
 * reader is handed. If this wrapper rendered the sentence and the control
 * rendered the wiring, a call site could pass one and forget the other, and the
 * failure would be invisible in review and invisible on screen: the message
 * would look right and the control would announce itself as valid. One prop, on
 * one component, cannot disagree with itself.
 *
 * Server component: no state, no event handler. It is imported by the client
 * form modules under `src/features/profile/`, which is what makes those forms
 * interactive, not anything here.
 */

/**
 * The id of a control's error message, derived from the control's own id.
 *
 * Exported so the three controls and this file build the same string. It is one
 * function rather than a template literal repeated four times, because
 * `aria-describedby` failing silently is exactly what an id typo does.
 */
export function fieldErrorId(id: string): string {
  return `${id}-error`;
}

/**
 * The error sentence under a control, rendered by the control itself.
 *
 * `role="alert"` so it is announced when it appears after a failed submit
 * rather than only being found by someone who goes looking for it.
 *
 * NOT RED, and that is `brand-tokens.md`'s rule rather than a preference: the
 * palette is the settled seven plus `--surface-sunken` and spec 0005 AC-1
 * closes it, so there is no error colour to reach for and adding one would be
 * this feature quietly widening a system it is only supposed to extend. The
 * message reads in `--secondary` (8.59:1 on paper), carries the dashed gap mark
 * so it is told apart by shape and not by colour, and the control beside it
 * takes an ink border. See `Input`'s `error` variant.
 */
export function FieldError({
  id,
  children,
}: {
  /**
   * The id a control points its `aria-describedby` at. Omitted for a whole form
   * message, which belongs to no single control: `role="alert"` still announces
   * it, and nothing needs to reference it by name.
   */
  readonly id?: string;
  readonly children: ReactNode;
}) {
  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 flex items-start gap-1.5 font-sans text-small text-secondary"
    >
      <GapIcon className="mt-1 h-3 w-3 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

type FieldProps = {
  /**
   * The id of the control inside. Passed to the control too, which is what
   * connects the label to it. Not generated here: a generated id would need
   * `useId`, and that would drag every page rendering a field across the client
   * boundary for a value the caller already knows.
   */
  readonly id: string;
  /** The visible label. A real `<label>` element, never a placeholder. */
  readonly label: ReactNode;
  /**
   * Marks the field as one the form accepts empty, shown in the label itself
   * rather than by marking every other field with an asterisk. Required is the
   * default, so a field that says nothing is required.
   */
  readonly optional?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
};

/**
 * A labelled form field.
 *
 * The label is always visible and always a real `<label htmlFor>`. There is no
 * visually hidden variant and no placeholder-as-label: a placeholder disappears
 * the moment somebody types, which is when they most need to know what they are
 * filling in (WCAG 2.2 AA).
 *
 * THERE IS NO SEPARATE HINT SLOT, deliberately. A hint rendered here would need
 * its own id in the control's `aria-describedby`, which is the same two halves
 * that must agree problem the error split above exists to remove. Guidance the
 * label cannot state goes INSIDE `label`, which is a `ReactNode`, so it joins
 * the accessible name instead of dangling beside it unreferenced.
 */
export function Field({
  id,
  label,
  optional = false,
  className,
  children,
}: FieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <label
        htmlFor={id}
        className="font-sans text-small font-medium text-secondary"
      >
        {label}
        {optional ? (
          <span className="font-normal text-muted"> (optional)</span>
        ) : undefined}
      </label>

      {children}
    </div>
  );
}

/**
 * The shared surface of every form control: `Input`, `Textarea` and `Select`.
 *
 * ONE DEFINITION FOR THE THREE, not one each. The three differ in exactly what
 * their element demands (a textarea's minimum height and resize handle, a
 * select's appearance reset and chevron) and in nothing else, so three copies of
 * the box would drift one control at a time and the drift would look
 * deliberate. Each control composes this and adds only its own difference.
 *
 * `min-h-11` is 44px, the WCAG 2.2 AA target size `Button`'s `md` already
 * clears, so a control and the button beside it line up as well as being
 * reachable.
 */
export const controlSurface = tv({
  base: [
    "w-full min-h-11 rounded-lg px-3 py-2",
    "bg-surface font-sans text-body text-ink",
    "border placeholder:text-muted",
    /**
     * Named properties rather than `transition-colors`, for the same reason
     * `Button` names them: Tailwind v4 folds `outline-color` into that
     * shorthand, which fades the shared `:focus-visible` ring in over 150ms and
     * makes a keyboard user watch their focus indicator arrive.
     */
    "transition-[border-color] duration-150 motion-reduce:transition-none",
    "disabled:cursor-not-allowed disabled:opacity-55",
  ],
  variants: {
    /**
     * The invalid state is a BORDER WEIGHT AND DARKNESS CHANGE, not a colour
     * change to red. `brand-tokens.md` has no error colour and spec 0005 AC-1
     * closes the palette at the settled seven, so the distinction is carried by
     * ink against the muted line everywhere else, by the dashed mark on the
     * message, and by `aria-invalid`. None of the three is colour alone, which
     * is the accessibility floor this project already holds itself to.
     */
    invalid: {
      true: "border-ink",
      false: "border-line",
    },
  },
  defaultVariants: {
    invalid: false,
  },
});
