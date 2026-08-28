import { describe, expect, it } from "vitest";

import { classesOf } from "../../../test/helpers/react-element";

import { Heading } from "./heading";
import { Text } from "./text";

/**
 * Spec 0005, AC-6 and AC-2.
 *
 * The composition review found mono had stopped meaning anything, because it
 * was applied to everything label shaped or data shaped alike. The rule these
 * tests hold is: mono for what the product measured or wrote, sans tracked caps
 * for decoration. Swap the two and the page still renders, still looks
 * designed, and has quietly lost the one signal the brand is built on.
 */
describe("Text register rule", () => {
  it.each([
    { variant: "monoLabel", why: "a short literal such as a salary or a date" },
    { variant: "monoData", why: "written reasoning the reader has to read" },
  ] as const)("sets $variant in mono, because it is $why", ({ variant }) => {
    // covers: AC-6
    const classes = classesOf(Text({ variant, children: "x" }));

    expect(classes).toContain("font-mono");
    expect(classes).not.toContain("font-sans");
  });

  it.each([
    { variant: "eyebrow", why: "a section opener, which is decoration" },
    { variant: "body", why: "running prose" },
    { variant: "muted", why: "quiet supporting prose" },
  ] as const)("sets $variant in sans, because it is $why", ({ variant }) => {
    // covers: AC-6
    const classes = classesOf(Text({ variant, children: "x" }));

    expect(classes).toContain("font-sans");
    expect(classes).not.toContain("font-mono");
  });

  it("tracks the eyebrow as caps, which is what replaces the old mono label", () => {
    // covers: AC-6. The retired `.eyebrow` global class was mono; this is not.
    const classes = classesOf(
      Text({ variant: "eyebrow", children: "Matched" }),
    );

    expect(classes).toContain("uppercase");
    expect(classes).toContain("tracking-[0.08em]");
  });
});

/**
 * The regression this feature actually shipped, caught at the call site rather
 * than at the merger. `Text` variant `eyebrow` composes a size and a colour in
 * one string; before `tv.ts` the size lost and the eyebrow rendered at body
 * size. `tv.test.ts` pins the merger; this pins the component that depends on
 * it, so the guard survives a refactor that moves the composition around.
 */
describe("Text keeps its size AND its colour, both", () => {
  it.each([
    ["eyebrow", "text-caption", "text-muted"],
    ["monoLabel", "text-small", "text-muted"],
    ["monoData", "text-small", "text-secondary"],
    ["body", "text-body", "text-ink"],
    ["muted", "text-small", "text-muted"],
  ] as const)("%s keeps %s and %s", (variant, size, colour) => {
    // covers: AC-2, AC-6, AC-15
    const classes = classesOf(Text({ variant, children: "x" }));

    expect(classes).toContain(size);
    expect(classes).toContain(colour);
  });
});

describe("Text element choice", () => {
  it("is a paragraph by default", () => {
    expect(Text({ children: "x" }).type).toBe("p");
  });

  it.each(["span", "li", "div", "dt", "dd"] as const)(
    "renders as %s when the document outline needs it",
    (as) => {
      // A register choice must never force the wrong element into the outline.
      expect(Text({ as, children: "x" }).type).toBe(as);
    },
  );
});

describe("Heading maps level to the locked scale", () => {
  it.each([
    [1, "h1", "text-display"],
    [2, "h2", "text-h2"],
    [3, "h3", "text-h3"],
  ] as const)("level %s is a %s at %s", (level, tag, size) => {
    // covers: AC-2
    const heading = Heading({ level, children: "Title" });

    expect(heading.type).toBe(tag);
    expect(classesOf(heading)).toContain(size);
  });

  it("keeps the size when the tag is overridden for the outline's sake", () => {
    // covers: AC-2. The visual weight and the outline sometimes disagree; the
    // override must not silently change the size too.
    const heading = Heading({ level: 3, as: "h2", children: "Title" });

    expect(heading.type).toBe("h2");
    expect(classesOf(heading)).toContain("text-h3");
  });
});
