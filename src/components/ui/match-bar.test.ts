import { describe, expect, it } from "vitest";

import { classesOf, flatten } from "../../../test/helpers/react-element";

import { MatchBar } from "./match-bar";

/**
 * Spec 0005, AC-7. The composition review found the bar hand copied at eight of
 * eight in one place and eight of eleven in another, so the picture disagreed
 * with the number printed beside it. The fix is that the bar derives its own
 * cells and there is no cell count prop, which is only true if these hold.
 */

function cellsOf(matched: number, total: number) {
  const cells = flatten(MatchBar({ matched, total })).filter(
    (element) => element.type === "span",
  );
  return {
    filled: cells.filter((c) => classesOf(c).includes("bg-primary-600")).length,
    outline: cells.filter((c) => classesOf(c).includes("border-line")).length,
    total: cells.length,
  };
}

describe("MatchBar cell derivation", () => {
  it("renders one cell per required skill, filled up to the match", () => {
    // covers: AC-7
    expect(cellsOf(6, 8)).toEqual({ filled: 6, outline: 2, total: 8 });
  });

  it("renders a different proportion from the same component", () => {
    // covers: AC-7 (the two proportions the spec names as its test scenario)
    expect(cellsOf(8, 11)).toEqual({ filled: 8, outline: 3, total: 11 });
  });

  it("renders every cell filled at a perfect match", () => {
    expect(cellsOf(4, 4)).toEqual({ filled: 4, outline: 0, total: 4 });
  });

  it("renders every cell outlined at no match", () => {
    expect(cellsOf(0, 5)).toEqual({ filled: 0, outline: 5, total: 5 });
  });

  it("handles the single skill role", () => {
    expect(cellsOf(1, 1)).toEqual({ filled: 1, outline: 0, total: 1 });
  });

  it("staggers by a per cell custom property, not a fixed nth-child list", () => {
    // covers: AC-9. A fixed list silently stops staggering past its last entry,
    // which is why the spec requires the index to be data.
    const filled = flatten(MatchBar({ matched: 3, total: 4 })).filter((el) =>
      classesOf(el).includes("match-cell"),
    );

    expect(
      filled.map(
        (el) => (el.props as { style: Record<string, number> }).style["--i"],
      ),
    ).toEqual([0, 1, 2]);
  });
});

describe("MatchBar accessible name", () => {
  it("names itself so the bar is not silent to a screen reader", () => {
    // covers: AC-13. The prototype marked the bar aria-hidden, which left a
    // screen reader user with a score and no sense of what it was out of.
    const bar = MatchBar({ matched: 6, total: 8 });

    expect(bar.props).toMatchObject({
      role: "img",
      "aria-label": "6 of 8 required skills matched",
    });
  });

  it("lets the caller override the name when the surrounding text already says it", () => {
    const bar = MatchBar({
      matched: 6,
      total: 8,
      label: "Match for this role",
    });

    expect((bar.props as { "aria-label": string })["aria-label"]).toBe(
      "Match for this role",
    );
  });
});

/**
 * AGENTS.md: a programmer bug throws and reaches the error boundary. Clamping
 * would render a bar that looks like a valid score, which is the silent failure
 * the project forbids: a wrong ratio reads exactly like a right one.
 */
describe("MatchBar refuses impossible input rather than clamping", () => {
  it.each([
    ["more matched than required", 9, 8],
    ["a negative match", -1, 8],
    ["no required skills at all", 0, 0],
    ["a negative total", 1, -3],
  ])("throws on %s", (_name, matched, total) => {
    expect(() => MatchBar({ matched, total })).toThrow(/matched/);
  });

  it.each([
    ["a fractional match", 2.5, 8],
    ["a fractional total", 2, 8.5],
    ["NaN", Number.NaN, 8],
  ])("throws on %s", (_name, matched, total) => {
    expect(() => MatchBar({ matched, total })).toThrow(/whole numbers/);
  });
});
