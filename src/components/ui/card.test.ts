import { describe, expect, it } from "vitest";

import {
  classesOf,
  flatten,
  textOf,
} from "../../../test/helpers/react-element";

import { Card } from "./card";

/**
 * Spec 0005, AC-3 and AC-10.
 *
 * The composition review found one container shape repeated everywhere, so
 * nothing on the page could be more important than anything else. Two idioms
 * fix that, but only while they stay two: the moment a flat card grows a shadow
 * the distinction is gone and the page is flat again, silently.
 */
function hasShadow(node: ReturnType<typeof Card>): boolean {
  return classesOf(node).some((c) => c.startsWith("shadow-["));
}

describe("Card keeps the two idioms apart", () => {
  it("gives the elevated card a shadow to be its boundary", () => {
    // covers: AC-3
    expect(hasShadow(Card({ tone: "elevated", children: "x" }))).toBe(true);
  });

  it("gives the flat card a border and no shadow at all", () => {
    // covers: AC-3
    const card = Card({ tone: "flat", children: "x" });

    expect(hasShadow(card)).toBe(false);
    expect(classesOf(card)).toContain("border-line");
  });

  it("never leads with a border AND a shadow on the same card", () => {
    // covers: AC-3, the key invariant. The elevated card carries a hint of a
    // border (`border-line/25`) on purpose; what it must never carry is the
    // full strength line that makes a card border led.
    for (const tone of ["elevated", "flat"] as const) {
      const classes = classesOf(Card({ tone, children: "x" }));
      const borderLed = classes.includes("border-line");
      const shadowLed = classes.some((c) => c.startsWith("shadow-["));

      expect(borderLed && shadowLed).toBe(false);
    }
  });

  it("pads both idioms the same, so neither reads as under padded", () => {
    // covers: AC-3
    const padding = (tone: "elevated" | "flat") =>
      classesOf(Card({ tone, children: "x" })).filter((c) =>
        /^p-|^sm:p-/.test(c),
      );

    expect(padding("elevated")).toEqual(padding("flat"));
    expect(padding("flat").length).toBeGreaterThan(0);
  });

  it("keeps its edge in a forced palette, where the shadow is discarded", () => {
    // covers: AC-12. An elevated card whose only boundary is a shadow would
    // lose it entirely; a system coloured border is what survives.
    for (const tone of ["elevated", "flat"] as const) {
      expect(classesOf(Card({ tone, children: "x" }))).toContain(
        "forced-colors:border-[CanvasText]",
      );
    }
  });

  it("becomes a real landmark when the caller says what it is", () => {
    expect(Card({ as: "article", children: "x" }).type).toBe("article");
    expect(Card({ children: "x" }).type).toBe("div");
  });
});

/**
 * AC-10. Adzuna's terms require a "Jobs by Adzuna" block of at least 116 by 23
 * pixels on EVERY displayed advert. That makes the footer a licensing
 * constraint, not a layout preference, which is why the slot exists now and not
 * when feature 11 needs it.
 */
describe("Card.Footer attribution slot", () => {
  it("lays the attribution out beside the action", () => {
    // covers: AC-10
    const footer = Card.Footer({
      children: "Apply",
      attribution: "Jobs by Adzuna",
    });

    // `sm:` and not bare: below the breakpoint the row is stacked, so there is
    // nothing to space apart. Confirmed as a real `space-between` row at 1440px
    // by /check verify.
    expect(classesOf(footer)).toContain("sm:justify-between");
    expect(textOf(footer)).toContain("Jobs by Adzuna");
  });

  it("stacks on a phone rather than compressing the licensed block", () => {
    // covers: AC-10. Wrapping in place would squeeze the block below its
    // licensed floor on a narrow screen, which breaches the terms rather than
    // just looking cramped.
    const classes = classesOf(
      Card.Footer({ children: "Apply", attribution: "x" }),
    );

    expect(classes).toContain("flex-col");
    expect(classes).toContain("sm:flex-row");
  });

  it("holds the attribution at its natural size in the row layout", () => {
    const footer = Card.Footer({ children: "Apply", attribution: "x" });
    const wrappers = flatten(footer).filter((el) =>
      classesOf(el).includes("shrink-0"),
    );

    expect(wrappers).toHaveLength(1);
  });

  it("renders no empty wrapper when there is nothing to attribute", () => {
    // A stray empty div would still take a gap and push the action off centre.
    const footer = Card.Footer({ children: "Apply" });

    expect(
      flatten(footer).filter((el) => classesOf(el).includes("shrink-0")),
    ).toHaveLength(0);
  });
});

describe("Card slots do not re-pad what the card already padded", () => {
  it.each(["Header", "Body", "Footer"] as const)(
    "%s adds spacing, not a second inset",
    (slot) => {
      // covers: AC-3. A slot with its own padding is how one card ends up
      // looking under padded next to another.
      const classes = classesOf(Card[slot]({ children: "x" }));

      expect(classes.filter((c) => /^p-\d|^px-\d|^py-\d/.test(c))).toEqual([]);
    },
  );
});
