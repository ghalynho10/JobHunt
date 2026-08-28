import { describe, expect, it } from "vitest";

import { classesOf } from "../../../test/helpers/react-element";

import { Section } from "./section";

/**
 * Spec 0005, AC-4, AC-5 and AC-8.
 *
 * The review found `py-20` on every section regardless of what it held, which
 * flattened the page into a list of equally important blocks, and a hairline
 * rule used as the only separator anywhere.
 */
describe("Section rhythm", () => {
  it.each([
    ["compact", "py-section-compact"],
    ["standard", "py-section-standard"],
    ["generous", "py-section-generous"],
  ] as const)("%s uses the %s tier", (weight, expected) => {
    // covers: AC-4
    expect(classesOf(Section({ weight, children: "x" }))).toContain(expected);
  });

  it("gives the three tiers three different values", () => {
    // covers: AC-4. Three names mapping to one value would pass every test
    // above and still be the uniform spacing the review flagged.
    const tiers = (["compact", "standard", "generous"] as const).map((weight) =>
      classesOf(Section({ weight, children: "x" })).find((c) =>
        c.startsWith("py-section-"),
      ),
    );

    expect(new Set(tiers).size).toBe(3);
  });
});

describe("Section background alternation", () => {
  it.each([
    ["paper", "bg-paper"],
    ["sunken", "bg-surface-sunken"],
  ] as const)("%s renders on %s", (background, expected) => {
    // covers: AC-5
    expect(classesOf(Section({ background, children: "x" }))).toContain(
      expected,
    );
  });
});

describe("Section divider", () => {
  it("draws a hairline when the caller says the neighbour matches", () => {
    // covers: AC-5
    expect(
      classesOf(Section({ divider: "hairline", children: "x" })),
    ).toContain("border-t");
  });

  it("draws nothing by default, since a changed background is the separation", () => {
    // covers: AC-5. Defaulting to a rule is how it became the only separator
    // mechanism on the page in the first place.
    expect(classesOf(Section({ children: "x" }))).not.toContain("border-t");
  });

  it("keeps the rule visible in a forced palette", () => {
    // covers: AC-12. Background alternation is discarded there, so the hairline
    // becomes the only separator left.
    expect(
      classesOf(Section({ divider: "hairline", children: "x" })),
    ).toContain("forced-colors:border-[CanvasText]");
  });
});

describe("Section structure", () => {
  it("is a section element, so it lands in the landmark list", () => {
    // covers: AC-13
    expect(Section({ children: "x" }).type).toBe("section");
  });

  it("takes a name for when its own heading does not identify it", () => {
    // covers: AC-13
    const section = Section({ children: "x", label: "How it works" });

    expect((section.props as { "aria-label": string })["aria-label"]).toBe(
      "How it works",
    );
  });

  it("spans the viewport while holding its content in a measured column", () => {
    // covers: AC-8. One element cannot do both, which is why there are two.
    const section = Section({ children: "x" });
    const inner = (
      section.props as { children: { props: { className: string } } }
    ).children;

    expect(classesOf(section)).toContain("w-full");
    expect(inner.props.className).toContain("max-w-6xl");
  });
});
