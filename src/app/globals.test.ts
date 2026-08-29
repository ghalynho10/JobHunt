import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The regression guard for a bug the browser had to find (spec 0005, AC-9 and
 * AC-12; found during feature 6's browser pass).
 *
 * `prefers-reduced-motion: reduce` was handled by zeroing `animation-duration`
 * and nothing else. That is not enough when an animation is DELAYED: the delay
 * survived, and `match-cell` is declared with the `both` fill mode, so during
 * its delay each cell held the keyframe's `from` state, which is `opacity: 0`.
 * Measured in a real browser: five of the hero card's eight cells were still
 * invisible 120ms after load and the last arrived 350ms in. A reader who asks
 * for less motion got the same staggered arrival with the smoothing taken off.
 *
 * Nothing in the unit suite can see a computed style: this project runs the
 * `node` environment with no jsdom, on purpose (spec 0004). So this reads the
 * stylesheet as text, the same technique `tv.test.ts` uses to keep the type
 * scale and the merger in step. The browser half of the proof lives in spec
 * 0005's `verify.md`, where it belongs.
 */

const globalsCss = readFileSync(
  fileURLToPath(new URL("./globals.css", import.meta.url)),
  "utf8",
);

/** The body of the `prefers-reduced-motion: reduce` block, braces balanced. */
function reducedMotionBlock(): string {
  const start = globalsCss.indexOf("@media (prefers-reduced-motion: reduce)");
  expect(
    start,
    "globals.css has no reduced motion block at all",
  ).toBeGreaterThan(-1);

  let depth = 0;
  for (let i = globalsCss.indexOf("{", start); i < globalsCss.length; i += 1) {
    const char = globalsCss[i];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return globalsCss.slice(start, i + 1);
    }
  }

  throw new Error("The reduced motion block is never closed.");
}

/**
 * Every property the reset has to neutralise, and why each one is here rather
 * than being a copy of a snippet from the internet. A property in this list
 * with no `!important` reset is a way for motion to survive the preference.
 */
const MUST_BE_NEUTRALISED = [
  /** The animation itself. */
  "animation-duration",
  /**
   * THE ONE THIS TEST EXISTS FOR. Removing it does not shorten anything, it
   * restores the staggered arrival described in the header comment.
   */
  "animation-delay",
  /** A repeating animation would otherwise run forever at 0.01ms a cycle. */
  "animation-iteration-count",
  /** The transition equivalent of the first. */
  "transition-duration",
  /** The transition equivalent of the second, for the first one that is added. */
  "transition-delay",
  /** Smooth scrolling is motion too, and it is the one a jump link triggers. */
  "scroll-behavior",
] as const;

describe("the reduced motion reset in globals.css", () => {
  const block = reducedMotionBlock();

  it.each(MUST_BE_NEUTRALISED)("neutralises %s with !important", (property) => {
    const declaration = new RegExp(`${property}\\s*:[^;]+!important\\s*;`);
    expect(block).toMatch(declaration);
  });

  it("zeroes both delays outright rather than merely shortening them", () => {
    expect(block).toMatch(/animation-delay:\s*0s\s*!important\s*;/);
    expect(block).toMatch(/transition-delay:\s*0s\s*!important\s*;/);
  });

  /**
   * The coupling that makes the delay reset load bearing rather than tidy. If
   * `match-cell` ever stops carrying a fill mode, the reset is merely good
   * hygiene; while it does carry one, removing the reset reintroduces invisible
   * cells. A later reader who thinks the line is redundant fails here and reads
   * why.
   */
  it("is required, because match-cell delays an animation that fills backwards", () => {
    const matchCell = globalsCss.slice(
      globalsCss.indexOf("@utility match-cell"),
      globalsCss.indexOf("}", globalsCss.indexOf("@utility match-cell")) + 1,
    );

    expect(matchCell, "match-cell no longer sets a fill mode").toMatch(
      /animation:[^;]*\bboth\b/,
    );
    expect(matchCell, "match-cell no longer sets a delay").toMatch(
      /animation-delay:\s*calc\(/,
    );
  });

  /**
   * Catches the next instance of the same mistake rather than only this one: a
   * motion property introduced elsewhere in this file with no matching reset.
   * The `animation` shorthand counts as a duration and a delay at once, since
   * it can set both.
   */
  it("covers every motion property this stylesheet declares outside it", () => {
    const outside = globalsCss.replace(block, "");
    const declared = new Set<string>();

    for (const [, property] of outside.matchAll(
      /^\s*(animation|animation-delay|animation-duration|transition|transition-delay|transition-duration|scroll-behavior)\s*:/gm,
    )) {
      if (property === "animation") {
        declared.add("animation-duration");
        declared.add("animation-delay");
      } else if (property === "transition") {
        declared.add("transition-duration");
        declared.add("transition-delay");
      } else {
        declared.add(property as string);
      }
    }

    const uncovered = [...declared].filter(
      (property) => !new RegExp(`${property}\\s*:[^;]+!important`).test(block),
    );

    expect(
      uncovered,
      `these are declared but never reset: ${uncovered.join(", ")}`,
    ).toEqual([]);
  });
});
