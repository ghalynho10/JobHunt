import { describe, expect, it } from "vitest";

import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import {
  classesOf,
  findByType,
  flatten,
  renderDeep,
} from "../../../test/helpers/react-element";

import { SignInBand } from "./sign-in-band";

/**
 * The sign in band (spec 0006, AC-6).
 *
 * The composition review found this band over signalled on three axes at once:
 * dark ground, centred text, and a narrowed measure. Two were removed. This
 * test is the thing that stops them creeping back one commit at a time, which
 * is exactly how they arrived the first time.
 */

const band = renderDeep(SignInBand(), [Section, Heading, Text]);
const section = findByType(band, Section);

/** Every class the band and its children carry, flattened. */
const allClasses = flatten(band).flatMap((element) => classesOf(element));

describe("the sign in band", () => {
  it("keeps the dark ground, which is its one distinguishing axis (covers AC-6)", () => {
    expect(classesOf(section)).toContain("bg-primary-800");
  });

  it("is never centred (covers AC-6)", () => {
    /**
     * `items-center` is deliberately NOT checked here. It appears inside the
     * provider row, where it aligns a 18px mark against its label on the cross
     * axis; that is vertical alignment within a control, not centring of the
     * band. What AC-6 forbids is the band centring its own content, which is
     * `text-center`, `mx-auto` on the content, or `justify-center` on its axis.
     */
    expect(allClasses).not.toContain("text-center");
    expect(allClasses).not.toContain("mx-auto");
    expect(allClasses).not.toContain("justify-center");
  });

  it("is never narrowed below the page's own measure (covers AC-6)", () => {
    const narrowing = allClasses.filter(
      (c) =>
        /^max-w-(xs|sm|md|lg|xl|2xl|3xl|4xl|5xl)$/.test(c) ||
        /^max-w-\[/.test(c),
    );

    expect(narrowing).toEqual([]);
  });

  it("takes the standard rhythm and no divider (covers AC-2, AC-3)", () => {
    expect(section?.props).toMatchObject({
      weight: "standard",
      divider: "none",
    });
  });

  it("is the anchor the header's sign in link jumps to (covers AC-7)", () => {
    expect((section?.props as { readonly id?: string }).id).toBe("start");
  });

  it("does not invite an action that cannot happen yet (covers AC-7)", () => {
    const body = flatten(band)
      .map((element) =>
        String(
          (element.props as { readonly children?: unknown }).children ?? "",
        ),
      )
      .join(" ");

    expect(body).toContain("is coming soon");
    expect(body).not.toContain("run your first search.");
  });
});
