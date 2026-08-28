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

/**
 * The fix for the one major finding of the 2026-08-28 fresh model review.
 *
 * `disabled` beside `href` used to type check and then be dropped: the anchor
 * branch never read it, and the `disabled:` utilities in the base styles key off
 * the CSS `:disabled` pseudo class, which an anchor can never match. So a
 * disabled "Apply" link on an expired posting would have compiled, rendered as a
 * live link with no visual difference, and looked correct in review.
 *
 * These are compile time assertions, not runtime ones, because the fix is in the
 * type. `@ts-expect-error` fails `tsc --noEmit` if the error it expects STOPS
 * happening, so this suite goes red the moment the props are flattened back into
 * one object. That is the only way to test a combination that can no longer be
 * written.
 */
describe("Button forbids the states an element cannot express", () => {
  /**
   * Props are hoisted so every call below fits on ONE line. A
   * `@ts-expect-error` suppresses only the line directly beneath it, so a call
   * Prettier wraps would move the error out from under its directive and this
   * suite would then assert the opposite of what it means. The first draft of
   * this file did exactly that, and `pnpm typecheck` caught it.
   */
  const LINK = { children: "x", href: "/j" } as const;

  it("rejects disabled on a link, which HTML has no way to render", () => {
    // covers: AC-13
    // @ts-expect-error `disabled` is `never` on the link shape, see ButtonAsLink
    const call = () => Button({ ...LINK, disabled: true });

    expect(call).toBeTypeOf("function");
  });

  it("rejects disabled on an external link too", () => {
    // @ts-expect-error same rule, whichever anchor branch it would have taken
    const call = () => Button({ ...LINK, external: true, disabled: true });

    expect(call).toBeTypeOf("function");
  });

  it("rejects external on a control that goes nowhere", () => {
    // @ts-expect-error `external` is `never` with no `href` to be external to
    const call = () => Button({ children: "x", external: true });

    expect(call).toBeTypeOf("function");
  });

  it("rejects a form type on a link, which is a button attribute", () => {
    // @ts-expect-error `type` is `never` on the link shape
    const call = () => Button({ ...LINK, type: "submit" });

    expect(call).toBeTypeOf("function");
  });

  it("still allows every legitimate combination", () => {
    // The guard is worthless if it also blocks ordinary use, so pin that too.
    expect(Button({ children: "Save", disabled: true }).type).toBe("button");
    expect(Button({ children: "Save", type: "submit" }).type).toBe("button");
    expect(
      Button({ children: "Go", href: "https://x.test", external: true }).type,
    ).toBe("a");
    expect(Button({ children: "Go", href: "/jobs" }).type).not.toBe("a");
  });
});

describe("Button disabled state", () => {
  it("disables the real button, which keeps it out of the tab order", () => {
    const el = Button({ children: "Save", disabled: true });

    expect((el.props as { disabled: boolean }).disabled).toBe(true);
  });
});
