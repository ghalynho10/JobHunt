import type { CSSProperties } from "react";

type MatchBarProps = {
  /** How many of the role's required skills the profile matched. */
  readonly matched: number;
  /** How many the role requires in total. */
  readonly total: number;
  /**
   * Overrides the accessible name. Default: "N of M required skills matched".
   * Pass one when the surrounding text already names what is being counted and
   * the default would be read twice.
   */
  readonly label?: string;
  readonly className?: string;
};

/**
 * The segmented match bar (spec 0005, AC-7, AC-9).
 *
 * It derives its own cells from `matched` and `total`, which is the whole point:
 * the composition review found the bar hand copied at eight of eight in one
 * place and eight of eleven in another, so the picture disagreed with the
 * number beside it. There is no cell count prop, and there is no way to render
 * this bar at a proportion its inputs do not describe.
 *
 * Value sourcing (spec 0005): `matched` and `total` always come from the
 * caller, from the scoring feature (feature 14) once it exists and from fixture
 * data until then. This component computes neither.
 */
export function MatchBar({ matched, total, label, className }: MatchBarProps) {
  /**
   * A programmer bug, so it throws and reaches the error boundary rather than
   * clamping. Clamping would render a bar that looks like a valid score, which
   * is the silent failure AGENTS.md forbids: a wrong match ratio reads exactly
   * like a right one.
   */
  if (!Number.isInteger(matched) || !Number.isInteger(total)) {
    throw new Error(
      `MatchBar needs whole numbers, got matched=${matched} total=${total}.`,
    );
  }

  if (total < 1 || matched < 0 || matched > total) {
    throw new Error(
      `MatchBar needs 0 <= matched <= total and total >= 1, got matched=${matched} total=${total}.`,
    );
  }

  const missing = total - matched;

  return (
    /**
     * `role="img"` with a real name, rather than the decorative `aria-hidden`
     * the prototype used. The bar is often the only thing next to the score, so
     * hiding it would leave a screen reader user with a number and no sense of
     * what it is out of.
     */
    <div
      role="img"
      aria-label={label ?? `${matched} of ${total} required skills matched`}
      className={`flex gap-[3px] ${className ?? ""}`}
    >
      {Array.from({ length: matched }, (_unused, index) => (
        <span
          key={`matched-${index}`}
          /**
           * The stagger reads `--i` per cell instead of a fixed `nth-child`
           * list, so it stays correct at any total. `globals.css` owns the
           * keyframes and the `prefers-reduced-motion` opt out, which is why
           * this is the one sanctioned default motion in the system (AC-9).
           */
          style={{ "--i": index } as CSSProperties}
          className="match-cell h-2 flex-1 rounded-sm bg-primary-600 forced-colors:bg-[Highlight]"
        />
      ))}
      {Array.from({ length: missing }, (_unused, index) => (
        <span
          key={`missing-${index}`}
          className="h-2 flex-1 rounded-sm border border-line forced-colors:border-[CanvasText]"
        />
      ))}
    </div>
  );
}
