import { describe, expect, it } from "vitest";

import { Field, FieldError, controlSurface, fieldErrorId } from "./field";
import { GapIcon } from "./icons";
import {
  findByType,
  flatten,
  textOf,
} from "../../../test/helpers/react-element";

/**
 * Spec 0010, AC-17: the label and layout wrapper every form control sits in.
 *
 * WHAT MATTERS HERE IS THE LABEL LINK. A control with no programmatic label is
 * unusable with a screen reader while looking perfectly fine on screen, which is
 * the failure mode this file exists to catch. The other half, that the error
 * message and the `aria-describedby` pointing at it cannot disagree, is proved
 * in each control's own test, because the control owns both.
 */

describe("Field connects its label to the control", () => {
  it("renders a real label element carrying htmlFor", () => {
    // covers: AC-17
    const label = findByType(
      Field({ id: "x", label: "Full name", children: null }),
      "label",
    );

    expect(label).toBeDefined();
    expect((label?.props as { htmlFor: string }).htmlFor).toBe("x");
    expect(textOf(label)).toContain("Full name");
  });

  it("takes a rich label, which is how guidance joins the accessible name", () => {
    /**
     * There is no separate hint slot on purpose: a hint rendered beside the
     * label would need its own id in the control's `aria-describedby`, which is
     * the same two halves must agree problem the error split exists to remove.
     * Guidance goes INSIDE the label instead, so it is part of the name.
     */
    const label = findByType(
      Field({
        id: "skills",
        label: ["Skills ", "one per line"],
        children: null,
      }),
      "label",
    );

    expect(textOf(label)).toContain("Skills");
    expect(textOf(label)).toContain("one per line");
  });

  it("says optional in the label rather than marking everything else required", () => {
    // covers: AC-17
    expect(
      textOf(
        Field({ id: "x", label: "Location", optional: true, children: null }),
      ),
    ).toContain("(optional)");
  });

  it("treats a field as required by default, so silence means required", () => {
    expect(
      textOf(Field({ id: "x", label: "Full name", children: null })),
    ).not.toContain("optional");
  });

  it("renders its control as a child rather than replacing it", () => {
    const rendered = Field({
      id: "x",
      label: "L",
      children: { marker: true } as never,
    });

    expect(flatten(rendered).length).toBeGreaterThan(0);
  });
});

describe("the error message id is built in one place", () => {
  it("derives the message id from the control's own id", () => {
    /**
     * One function rather than a template literal repeated in four files,
     * because an id typo makes `aria-describedby` point at nothing and fails
     * silently: the sentence is on screen and the screen reader never reaches it.
     */
    expect(fieldErrorId("identity-full-name")).toBe("identity-full-name-error");
  });

  it("gives two controls two different message ids", () => {
    expect(fieldErrorId("a")).not.toBe(fieldErrorId("b"));
  });
});

describe("FieldError announces itself and does not rely on colour", () => {
  it("carries role alert so it is heard when it appears", () => {
    /**
     * The message shows up after a submit, on a page the reader is already on.
     * Without `role="alert"` it is only found by somebody who goes looking.
     */
    // covers: AC-12, AC-17
    const rendered = FieldError({
      id: "x-error",
      children: "Enter your name.",
    });

    expect((rendered.props as { role: string }).role).toBe("alert");
    expect(textOf(rendered)).toContain("Enter your name.");
  });

  it("marks itself with the dashed gap icon, not with colour alone", () => {
    /**
     * `brand-tokens.md` has no error colour and spec 0005 AC-1 closes the
     * palette, so the message reads in `--secondary` like other quiet text. The
     * icon is what tells it apart by shape, which is also what survives a forced
     * palette and colour vision differences.
     */
    // covers: AC-17
    expect(
      findByType(FieldError({ id: "x", children: "m" }), GapIcon),
    ).toBeDefined();
  });

  it("takes the id a control points at, so the two match", () => {
    const rendered = FieldError({ id: fieldErrorId("email"), children: "m" });

    expect((rendered.props as { id: string }).id).toBe("email-error");
  });

  it("omits the id for a whole form message, which belongs to no control", () => {
    const rendered = FieldError({ children: "Your session has ended." });

    expect((rendered.props as { id?: string }).id).toBeUndefined();
    expect((rendered.props as { role: string }).role).toBe("alert");
  });
});

describe("the shared control surface", () => {
  it("clears the WCAG 2.2 AA target size, matching the button beside it", () => {
    /** `min-h-11` is 44px, the size `Button`'s `md` already clears. */
    // covers: AC-17
    expect(controlSurface()).toContain("min-h-11");
  });

  it("changes the border rather than reaching for a colour that does not exist", () => {
    /**
     * The invalid state is carried by an ink border against the muted line
     * everywhere else, by the dashed mark on the message, and by `aria-invalid`.
     * None of the three is colour alone, and none of them adds a token to a
     * palette spec 0005 closed.
     */
    // covers: AC-17
    expect(controlSurface({ invalid: true })).toContain("border-ink");
    expect(controlSurface({ invalid: false })).toContain("border-line");
    expect(controlSurface({ invalid: true })).not.toContain("border-line");
  });

  it("is not invalid unless it is told it is", () => {
    expect(controlSurface()).toContain("border-line");
  });

  it("names the properties it transitions, so the focus ring is never faded in", () => {
    /**
     * Tailwind v4 folds `outline-color` into `transition-colors`, which fades the
     * shared `:focus-visible` ring in over 150ms: a keyboard user watches their
     * focus indicator arrive. `Button` names its properties for the same reason.
     */
    expect(controlSurface()).not.toContain("transition-colors");
    expect(controlSurface()).toContain("transition-[border-color]");
  });
});
