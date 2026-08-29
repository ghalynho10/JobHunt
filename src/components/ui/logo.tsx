/**
 * The JobHunt logo (spec 0006). One component, two cuts: the bracket mark alone
 * and the full lockup (mark plus wordmark).
 *
 * WHY THIS LIVES IN THE DESIGN SYSTEM AND NOT IN THE ENTRY PAGE FEATURE. It has
 * three consumers the day it lands (the page header, the page footer, and the
 * social preview image generator, which is a route and so sits outside any
 * feature folder), and the application shell will be a fourth. Spec 0005's
 * component inventory predates it and does not list it; spec 0006 records that
 * it deliberately extends that inventory by one, so a reader comparing the table
 * in `AGENTS.md` against this directory finds the reason rather than a mismatch.
 *
 * NO FONT IS INVOLVED. The wordmark is outlined vector paths lifted from
 * `docs/design/logo/lockup.svg`, not text set in Space Grotesk, so it renders
 * identically whether or not the typeface loaded. That is what lets the preview
 * image draw the brand without shipping font bytes to do it.
 *
 * Decorative by default, exactly like the icon set: a logo usually sits inside a
 * link or a heading that already carries the name, and a second name there just
 * doubles it up. Pass `label` when the logo stands alone and IS the name.
 */

import {
  LOCKUP_VIEWBOX,
  MARK_RECTS,
  MARK_SCALE,
  WORDMARK_OFFSET_X,
  WORDMARK_PATH,
} from "./logo-geometry";

type LogoProps = {
  /** `lockup` is mark plus wordmark; `mark` is the bracket symbol alone. */
  readonly variant?: "lockup" | "mark";
  /** Overrides the default size. Colour comes from `currentColor`, not here. */
  readonly className?: string;
  /**
   * The accessible name, when this logo stands alone and nothing around it says
   * "JobHunt". Omitted (the default) means the logo is decorative and hidden,
   * which is correct inside a labelled home link.
   */
  readonly label?: string;
};

/** The five rectangles as elements, shared by both cuts. */
function markRects() {
  return MARK_RECTS.map((r) => (
    <rect
      key={`${r.x}-${r.y}-${r.width}-${r.height}`}
      x={r.x}
      y={r.y}
      width={r.width}
      height={r.height}
    />
  ));
}

export function Logo({ variant = "lockup", className, label }: LogoProps) {
  /**
   * `role="img"` is set only alongside a real name. An SVG that is both
   * `aria-hidden` and `role="img"` is contradictory, and some assistive
   * technology resolves the conflict the wrong way.
   */
  const naming =
    label === undefined
      ? ({ "aria-hidden": "true" } as const)
      : ({ role: "img", "aria-label": label } as const);

  if (variant === "mark") {
    return (
      <svg
        viewBox="0 0 32 32"
        className={className ?? "h-8 w-8"}
        fill="currentColor"
        {...naming}
      >
        {markRects()}
      </svg>
    );
  }

  return (
    <svg
      viewBox={LOCKUP_VIEWBOX}
      className={className ?? "h-7 w-auto"}
      fill="currentColor"
      {...naming}
    >
      <g transform={`scale(${MARK_SCALE})`}>{markRects()}</g>
      <path transform={`translate(${WORDMARK_OFFSET_X} 0)`} d={WORDMARK_PATH} />
    </svg>
  );
}
