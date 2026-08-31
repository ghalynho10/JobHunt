import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { GitHubIcon, GoogleIcon } from "@/components/ui/icons";
import {
  findAllByType,
  flatten,
  renderDeep,
  textOf,
} from "../../../test/helpers/react-element";

import { SignInControls } from "./sign-in-controls";

/**
 * The two provider controls (spec 0007, AC-2 and AC-16).
 *
 * THIS FILE USED TO ASSERT THE OPPOSITE, and the inversion is the point. Under
 * spec 0006 AC-7 these were labels, and the test's job was to fail the moment
 * somebody "helpfully" turned them back into links, which is what the prototype
 * had them as. Spec 0007 AC-16 supersedes that criterion: sign in is real now,
 * so a label saying "soon" is the thing that would be false.
 *
 * What the tests below hold instead is the pair of properties that make these
 * safe to be real: they are genuine form submits, so they work without
 * JavaScript, and nothing in this tree crosses the client boundary, so the entry
 * page still ships none.
 */

const controls = renderDeep(SignInControls(), [Button, GoogleIcon, GitHubIcon]);

const forms = flatten(controls).filter((element) => element.type === "form");
const buttons = findAllByType(controls, Button);

describe("the provider controls", () => {
  it("names both providers (covers AC-16)", () => {
    expect(textOf(controls)).toContain("Sign in with Google");
    expect(textOf(controls)).toContain("Sign in with GitHub");
  });

  it("renders one real form per provider (covers AC-16)", () => {
    expect(forms).toHaveLength(2);
  });

  /**
   * THE LOAD BEARING ONE. A `<form action={serverAction}>` posts with JavaScript
   * switched off; an `onClick` would not, and would drag this whole page across
   * the client boundary to do it. Asserting the action is a function rather than
   * a string is what separates the two: a Server Action reference arrives here as
   * a function, and a plain URL would arrive as a string.
   */
  it.each([0, 1])(
    "posts form %i to a server action, not to a URL (covers AC-2, AC-16)",
    (index) => {
      const action = (forms[index]?.props as { readonly action?: unknown })
        .action;

      expect(action).toBeTypeOf("function");
    },
  );

  /**
   * Two separate actions rather than one taking a provider argument. The spec
   * chose that deliberately: a provider name arriving from a form would be
   * untrusted input needing its own boundary parse, for nothing gained when the
   * set is closed at two. If both forms ever posted to the same action, that
   * argument would have to come from somewhere.
   */
  it("posts each provider to its own action (covers AC-16)", () => {
    const [first, second] = forms.map(
      (form) => (form.props as { readonly action?: unknown }).action,
    );

    expect(first).not.toBe(second);
  });

  it("submits rather than merely looking like a control (covers AC-16)", () => {
    expect(buttons).toHaveLength(2);

    for (const button of buttons) {
      expect((button.props as { readonly type?: string }).type).toBe("submit");
    }
  });

  /**
   * SPEC 0006 AC-7'S GHOSTS, asserted gone rather than assumed gone. `COPY-1`
   * and the two "soon" chips were false for every visitor the moment sign in
   * shipped, so AC-16 deletes them. A stray copy of either would read as a
   * product that still has not launched.
   */
  it.each(["soon", "isn't live yet", "Coming soon"])(
    "no longer says %j (covers AC-16)",
    (gone) => {
      expect(textOf(controls)).not.toContain(gone);
    },
  );

  it("carries both marks, so the providers read without the text too", () => {
    expect(findAllByType(controls, GoogleIcon)).toHaveLength(1);
    expect(findAllByType(controls, GitHubIcon)).toHaveLength(1);
  });

  /**
   * The button's own text is its accessible name, so no `label` override is
   * wanted here. An `aria-label` would REPLACE the visible text for a screen
   * reader, and the two drifting apart is a WCAG 2.5.3 failure rather than a
   * tidiness issue.
   */
  it("lets the visible text be the accessible name", () => {
    for (const button of buttons) {
      expect(
        (button.props as { readonly label?: string }).label,
      ).toBeUndefined();
    }
  });
});
