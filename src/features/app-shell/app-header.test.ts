import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

import { findAllByType, renderDeep } from "../../../test/helpers/react-element";

import { AppHeader } from "./app-header";

/**
 * Spec 0008, AC-1, AC-5 and AC-21: the signed in header.
 *
 * THE CURRENT PAGE MARKER IS THE WHOLE POINT OF THIS FILE. AC-3a asked the
 * `(app)` layout to compose this header once, and AC-5 asks each route to pass
 * its own `aria-current="page"` in. Those two cannot both hold, because a layout
 * never learns the pathname. The engineer resolved it on 2026-08-31 by composing
 * per route, and these tests are what stop a later reader from "simplifying" it
 * back into the layout: doing so would have nowhere to get `current` from, and
 * these assertions would fail rather than the marker quietly disappearing.
 */

/** The header, with the design system left as elements to read props off. */
function header(current?: "search" | "profile") {
  return renderDeep(AppHeader({ current }), [Button]);
}

/** The navigation links, in order, as `[label, href, current]`. */
function navigationOf(current?: "search" | "profile") {
  return findAllByType(header(current), Button)
    .map((button) => button.props as Record<string, unknown>)
    .filter((props) => typeof props.href === "string")
    .map((props) => [props.children, props.href, props.current]);
}

describe("what the signed in navigation offers (AC-1)", () => {
  it("carries search and profile, and nothing else", () => {
    /**
     * `/applications` is deliberately absent: it is reached from the link on
     * `/profile`, so the shell stays at two items and never grows a menu. A
     * third item appearing here is the first step toward the hamburger AC-4
     * rules out.
     */
    expect(navigationOf("search").map(([label]) => label)).toEqual([
      "Search",
      "Profile",
    ]);
  });

  it("sends each item to its own route", () => {
    expect(navigationOf().map(([, href]) => href)).toEqual([
      "/search",
      "/profile",
    ]);
  });
});

describe("the current page marker (AC-5)", () => {
  it.each([
    ["search", [true, false]],
    ["profile", [false, true]],
  ] as const)(
    "marks only %s when the route says it is %s",
    (current, expected) => {
      expect(navigationOf(current).map(([, , isCurrent]) => isCurrent)).toEqual(
        expected,
      );
    },
  );

  it("marks nothing on a route that is not in the navigation", () => {
    /**
     * `/applications` and `/health` are both under the shell and neither is in
     * the navigation, so nothing should claim to be the current page. Marking
     * one anyway would tell a screen reader user they are somewhere they are
     * not.
     */
    expect(navigationOf().map(([, , isCurrent]) => isCurrent)).toEqual([
      false,
      false,
    ]);
  });
});

describe("sign out (AC-21)", () => {
  it("is a real form submit, posting to a server action", () => {
    const forms = findAllByType(header("search"), "form" as never);

    expect(forms).toHaveLength(1);
    /**
     * A form rather than a link: signing out is a write, and binding rule 7
     * keeps writes in Server Actions. It also works with JavaScript switched
     * off, which is what keeps the whole header free of a client boundary.
     */
    expect((forms[0]?.props as { action?: unknown }).action).toBeTypeOf(
      "function",
    );
  });
});
