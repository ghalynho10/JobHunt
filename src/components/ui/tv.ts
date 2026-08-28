import { createTV } from "tailwind-variants";

/**
 * The project's configured `tv`. Every base component imports this one, never
 * `tv` from the package directly.
 *
 * WHY THIS FILE EXISTS, because it looks like indirection for its own sake.
 *
 * `tailwind-variants` resolves conflicting classes with `tailwind-merge`, which
 * knows Tailwind's stock scale and nothing else. Tailwind's `text-*` prefix is
 * two things at once, a font size (`text-sm`) and a text colour (`text-muted`),
 * and `tailwind-merge` tells them apart from a list of known sizes. Spec 0005's
 * type scale renames every size (`text-display`, `text-h2`, `text-body`), so
 * with the stock config every one of them is read as a COLOUR, lands in the same
 * conflict group as the real colour beside it, and one of the two is silently
 * dropped.
 *
 * This was not theoretical. Before this file, `Text` variant `eyebrow` composed
 * `text-caption ... text-muted` and shipped 17px grey text instead of 12px,
 * because `text-caption` was discarded as a losing colour; `Button` variant
 * `tertiary` composed `text-primary-800` with `text-body` and rendered ink
 * instead of teal. Measured in the browser at `font-size: 17px` on an element
 * whose scale value is 12px.
 *
 * Registering the six sizes as the `font-size` group restores the distinction.
 * `conflictingClassGroupModifiers` carries the stock behaviour for the group:
 * `text-body/6` sets a line height, so a later `leading-*` has to lose to it.
 *
 * A seventh size added to `globals.css` has to be added here too, or it silently
 * behaves like a colour again.
 */
export const tv = createTV({
  twMergeConfig: {
    extend: {
      classGroups: {
        "font-size": [
          {
            text: ["display", "h2", "h3", "body", "small", "caption"],
          },
        ],
      },
      conflictingClassGroupModifiers: {
        "font-size": ["leading"],
      },
    },
  },
});
