import { describe, expect, it } from "vitest";

import { classesOf, flatten } from "../../../test/helpers/react-element";

import { Logo } from "./logo";
import { SiteHeader } from "./site-header";

/**
 * Spec 0008, AC-3 and AC-4: the header chrome.
 *
 * The two rules worth locking here are the ones a later edit breaks without
 * noticing: an empty navigation landmark, and the lockup that overflows a 320
 * pixel viewport. Neither shows up as an error, and the second one was real
 * rather than hypothetical, measured in a browser on 2026-08-31 at 350 pixels
 * of content in a 320 pixel window.
 *
 * What is NOT asserted here is the absence of a hamburger. There is no code that
 * could grow one by accident, so a test for it would only restate the file.
 */

const chrome = { homeHref: "/", homeLabel: "JobHunt home" };

describe("the navigation slot", () => {
  it("renders no nav landmark when there is nothing to put in it", () => {
    const navs = flatten(SiteHeader(chrome)).filter(
      (element) => element.type === "nav",
    );

    /**
     * `/sign-in` and `/ui-preview` take an empty slot (AC-5a). An empty `nav`
     * would announce a Primary navigation to a screen reader user and then have
     * nothing in it, which is worse than having no landmark.
     */
    expect(navs).toHaveLength(0);
  });

  it("renders one nav landmark when there is", () => {
    const navs = flatten(SiteHeader({ ...chrome, navigation: "links" })).filter(
      (element) => element.type === "nav",
    );

    expect(navs).toHaveLength(1);
    expect((navs[0]?.props as { "aria-label"?: string })["aria-label"]).toBe(
      "Primary",
    );
  });

  it("lets a caller hide the slot without fighting its own layout", () => {
    /**
     * The entry page hides its in page anchors below `md` (spec 0006, AC-4).
     * `tailwind-merge` has to resolve `hidden` against the slot's own `flex`,
     * or both survive and the anchors stay visible at every width.
     */
    const nav = flatten(
      SiteHeader({
        ...chrome,
        navigation: "links",
        navigationClassName: "hidden md:flex",
      }),
    ).find((element) => element.type === "nav");

    const classes = classesOf(nav);

    expect(classes).toContain("hidden");
    expect(classes).toContain("md:flex");
    expect(classes).not.toContain("flex");
  });
});

describe("the lockup at 320 pixels (AC-4)", () => {
  it("renders the mark below sm and the lockup above it", () => {
    const logos = flatten(SiteHeader(chrome)).filter(
      (element) => element.type === Logo,
    );

    /**
     * MEASURED, NOT PREFERRED. The lockup renders 190 pixels wide, which leaves
     * 82 pixels at 320 once the header's own padding is taken, and the signed in
     * cluster needs 168. Both headers overflowed until this split landed.
     *
     * Both are rendered and one is hidden in CSS: choosing between them in
     * JavaScript would need a client boundary, and `/sign-in` may not have one.
     */
    expect(logos).toHaveLength(2);

    const mark = logos.find(
      (logo) => (logo.props as { variant?: string }).variant === "mark",
    );
    const lockup = logos.find(
      (logo) => (logo.props as { variant?: string }).variant === "lockup",
    );

    expect(classesOf(mark)).toContain("sm:hidden");
    expect(classesOf(lockup)).toContain("hidden");
    expect(classesOf(lockup)).toContain("sm:block");
  });
});
