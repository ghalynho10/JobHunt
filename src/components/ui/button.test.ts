import Link from "next/link";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import { ExternalLinkIcon } from "./icons";
import { findByType, textOf } from "../../../test/helpers/react-element";

/**
 * Spec 0005, AC-13. The element a control renders is not cosmetic: a thing that
 * navigates has to be an anchor so it works with middle click, copy link and
 * open in new tab, and a thing that acts has to be a button so it responds to
 * the space bar. Getting this wrong is invisible on screen and breaks the
 * keyboard and the mouse at once.
 */
describe("Button picks its element from whether it navigates", () => {
  it("is a real button when there is nowhere to go", () => {
    // covers: AC-13
    const el = Button({ children: "Save" });

    expect(el.type).toBe("button");
    expect((el.props as { type: string }).type).toBe("button");
  });

  it("never defaults to submit, which would fire the nearest form", () => {
    expect((Button({ children: "Save" }).props as { type: string }).type).toBe(
      "button",
    );
  });

  it("submits only when asked", () => {
    const el = Button({ children: "Sign in", type: "submit" });

    expect((el.props as { type: string }).type).toBe("submit");
  });

  it("routes internal navigation through next/link so the route prefetches", () => {
    expect(Button({ children: "Home", href: "/" }).type).toBe(Link);
  });

  it("is a plain anchor when the link leaves the product", () => {
    const el = Button({
      children: "Apply",
      href: "https://example.com/posting",
      external: true,
    });

    expect(el.type).toBe("a");
  });
});

describe("Button external links", () => {
  it("closes the window.opener handle the new tab would inherit", () => {
    // covers: AC-13. rel=noopener is the security half; noreferrer the privacy
    // half. A missing noopener hands the opened page a handle to this one.
    const el = Button({
      children: "Apply",
      href: "https://x.test",
      external: true,
    });

    expect(el.props).toMatchObject({
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("marks the link visually so leaving the product is not a surprise", () => {
    const el = Button({
      children: "Apply",
      href: "https://x.test",
      external: true,
    });

    expect(findByType(el, ExternalLinkIcon)).toBeDefined();
  });

  it("adds no marker and no target to an internal link", () => {
    const el = Button({ children: "Home", href: "/" });

    expect(findByType(el, ExternalLinkIcon)).toBeUndefined();
    expect((el.props as { target?: string }).target).toBeUndefined();
  });
});

describe("Button accessible name", () => {
  it("uses its visible label by default", () => {
    const el = Button({ children: "Apply on the real posting" });

    expect(textOf(el)).toBe("Apply on the real posting");
    expect(
      (el.props as { "aria-label"?: string })["aria-label"],
    ).toBeUndefined();
  });

  it("takes an override for when the visible label is ambiguous in a list", () => {
    // covers: AC-13. Twenty result cards all saying "Apply" need distinct names.
    const el = Button({ children: "Apply", label: "Apply at Northwind Labs" });

    expect((el.props as { "aria-label": string })["aria-label"]).toBe(
      "Apply at Northwind Labs",
    );
  });
});

describe("Button disabled state", () => {
  it("disables the real button, which keeps it out of the tab order", () => {
    const el = Button({ children: "Save", disabled: true });

    expect((el.props as { disabled: boolean }).disabled).toBe(true);
  });
});
