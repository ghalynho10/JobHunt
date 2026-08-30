import { describe, expect, it } from "vitest";

import { Heading } from "@/components/ui/heading";
import { Button } from "@/components/ui/button";
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

/**
 * `Button` joins the stop list from spec 0007 onward, and it is not padding.
 * The band now renders two real provider submits, and `Button`'s own base class
 * list contains `justify-center`, which centres a label INSIDE a control. The
 * AC-6 assertion below is about the band centring its own content. Without the
 * stop, the band's class list absorbs the button's and AC-6 fails on something
 * it was never about, which is the same false positive the `items-center` note
 * below already anticipated.
 */
const band = renderDeep(SignInBand(), [Section, Heading, Text, Button]);
const section = findByType(band, Section);

/** The props the band really hands `Section`, not a copy written out here. */
const sectionProps = section?.props as Parameters<typeof Section>[0];

/**
 * The class list `Section` actually produces for those props.
 *
 * READ THE OUTPUT, NOT THE PROP. The band is the one place on this page that
 * gets its ground from a `className` beating `Section`'s own `background`
 * variant through tailwind-merge. Asserting that the `className` prop contains
 * `bg-primary-800` proves only that the band ASKED; it stays green if the merge
 * stops resolving, which is the failure that would actually turn the band
 * paper. A fresh model review caught exactly that, and the mutation confirmed
 * it: the old assertion passed with the band explicitly set to `paper`.
 */
const resolved = classesOf(Section(sectionProps));

/** Every class the band and its children carry, flattened. */
const allClasses = flatten(band).flatMap((element) => classesOf(element));

describe("the sign in band", () => {
  it("resolves to the dark ground, not the default paper (covers AC-6)", () => {
    expect(resolved).toContain("bg-primary-800");
    expect(resolved).not.toContain("bg-paper");
  });

  it("leaves exactly one background standing, so the merge really resolved (covers AC-6)", () => {
    expect(resolved.filter((c) => /^bg-/.test(c))).toEqual(["bg-primary-800"]);
  });

  /**
   * The canary. Without it the two assertions above could pass for the wrong
   * reason (a `Section` that never emits a background at all), and the test
   * would be measuring nothing. Drop the override and paper must come back.
   */
  it("falls back to paper without the override, which is what makes that meaningful", () => {
    const withoutOverride = Section({
      ...sectionProps,
      className: "scroll-mt-16",
    });

    expect(classesOf(withoutOverride)).toContain("bg-paper");
    expect(classesOf(withoutOverride)).not.toContain("bg-primary-800");
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

  /**
   * INVERTED BY SPEC 0007, AC-16. This used to assert the band said sign in was
   * "coming soon", which was right for exactly as long as it was true. Sign in
   * is real now, so the same sentence would be the falsehood, and the band has
   * to offer the action rather than defer it.
   *
   * The second assertion is unchanged and still spec 0006's: the band invites a
   * sign in, not a search, because search is feature 11.
   */
  it("offers the action rather than deferring it (covers AC-16)", () => {
    const body = flatten(band)
      .map((element) =>
        String(
          (element.props as { readonly children?: unknown }).children ?? "",
        ),
      )
      .join(" ");

    expect(body).not.toContain("coming soon");
    expect(body).toContain("Sign in with Google or GitHub.");
    expect(body).not.toContain("run your first search.");
  });
});
