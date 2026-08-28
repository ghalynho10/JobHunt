import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { tv as stockTv } from "tailwind-variants";
import { describe, expect, it } from "vitest";

import { tv } from "./tv";

/**
 * The regression guard for the one bug in this feature that was invisible.
 *
 * `tailwind-merge` tells a font size from a text colour by a list of known
 * sizes. Spec 0005 renames every size (`text-display`, `text-h2`, `text-body`),
 * so under the stock config each one is read as a COLOUR, shares a conflict
 * group with the real colour beside it, and one of the two is silently dropped.
 * No error, no warning, no failing build: the page just renders at the wrong
 * size and looks deliberate. It shipped that way until it was measured in a
 * browser.
 *
 * These tests are behavioural on purpose. None of them reads the list inside
 * `tv.ts`; they read the scale out of `globals.css` and check that the merger
 * actually keeps both classes. That means a seventh size added to the scale and
 * forgotten in `tv.ts` fails here on its own, with no test to remember to
 * update, which is the only version of this guard worth having.
 */

const globalsCss = readFileSync(
  fileURLToPath(new URL("../../app/globals.css", import.meta.url)),
  "utf8",
);

/**
 * The size names the `@theme` block actually declares, e.g. `body` from
 * `--text-body`. The `--text-body--line-height` and `--text-body--letter-spacing`
 * companions are excluded: they are properties OF a size, not sizes.
 */
function scaleSizesFromCss(): readonly string[] {
  const names = [...globalsCss.matchAll(/^\s*--text-([a-z0-9-]+):/gm)]
    .map((match) => match[1] as string)
    .filter((name) => !name.includes("--"));
  return [...new Set(names)];
}

describe("the type scale, as declared in globals.css", () => {
  it("declares the six sizes spec 0005 AC-2 fixes", () => {
    // covers: AC-2
    expect([...scaleSizesFromCss()].sort()).toEqual([
      "body",
      "caption",
      "display",
      "h2",
      "h3",
      "small",
    ]);
  });
});

/**
 * Spec 0005, AC-1. `@theme inline` bakes each value into every utility at build
 * time. That would still look completely correct on screen, and would silently
 * kill three things that depend on a utility resolving its variable at use time:
 * the `prefers-contrast: more` override, the responsive body size, and the
 * responsive section rhythm. Nothing else in the suite would notice.
 */
describe("the @theme block is not inline, which three features depend on", () => {
  /**
   * Comments stripped first. `globals.css` explains at length that the block is
   * deliberately NOT `@theme inline`, and a naive search finds that sentence and
   * reports the very thing it promises. The first version of this test did.
   */
  const declarations = globalsCss.replace(/\/\*[\s\S]*?\*\//g, "");

  it("declares a plain @theme", () => {
    // covers: AC-1
    expect(declarations).toMatch(/^@theme \{/m);
  });

  it("never declares @theme inline", () => {
    // covers: AC-1, AC-2, AC-5, AC-12
    expect(declarations).not.toMatch(/@theme\s+inline/);
  });

  it("maps theme colours through the raw tokens rather than restating them", () => {
    // covers: AC-1. `--color-paper: #FFFAFB` would be inline by hand.
    expect(declarations).toMatch(/--color-paper:\s*var\(--paper\)/);
  });
});

describe("the configured tv keeps a size and a colour apart", () => {
  /**
   * The real shape of the bug. `Text` variant `eyebrow` is one string,
   * `text-caption ... text-muted`, and the merger sees both at once.
   */
  it.each(scaleSizesFromCss())(
    "keeps both text-%s and the colour beside it",
    (size) => {
      // covers: AC-2, AC-6, AC-15
      const classes = tv({ base: `text-${size} text-muted` })().split(" ");

      expect(classes).toContain(`text-${size}`);
      expect(classes).toContain("text-muted");
    },
  );

  it("keeps the size whichever order the two are written in", () => {
    // covers: AC-15
    const classes = tv({ base: "text-muted text-caption" })().split(" ");

    expect(classes).toContain("text-caption");
    expect(classes).toContain("text-muted");
  });

  it("keeps a size and a line height together, as monoData composes them", () => {
    // covers: AC-6
    const classes = tv({ base: "text-small leading-[1.6]" })().split(" ");

    expect(classes).toContain("text-small");
    expect(classes).toContain("leading-[1.6]");
  });

  it("still lets one size override another, which is the point of merging", () => {
    // covers: AC-15
    const classes = tv({ base: "text-body text-h2" })().split(" ");

    expect(classes).toContain("text-h2");
    expect(classes).not.toContain("text-body");
  });

  it("still lets one colour override another", () => {
    const classes = tv({ base: "text-muted text-ink" })().split(" ");

    expect(classes).toContain("text-ink");
    expect(classes).not.toContain("text-muted");
  });
});

/**
 * THE VACUOUSNESS CHECK. Every assertion above would pass against a merger that
 * did nothing at all, so none of them proves the configuration is doing any
 * work. This one pins the failure the configuration exists to prevent: with the
 * stock `tv` straight from the package, the size is dropped.
 *
 * If this test ever starts failing because the stock merger keeps both, then
 * `tailwind-merge` has learned to read the theme itself and `tv.ts` may be able
 * to go away. That is a good failure. Read it, do not silence it.
 */
describe("the stock tv, which is why tv.ts exists", () => {
  it("silently drops the size, treating it as a losing colour", () => {
    const classes = stockTv({ base: "text-caption text-muted" })().split(" ");

    expect(classes).toContain("text-muted");
    expect(classes).not.toContain("text-caption");
  });
});
