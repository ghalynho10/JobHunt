import { describe, expect, it } from "vitest";

import { Chip } from "@/components/ui/chip";
import { GitHubIcon, GoogleIcon } from "@/components/ui/icons";
import { Text } from "@/components/ui/text";
import {
  classesOf,
  findAllByType,
  renderDeep,
  textOf,
} from "../../../test/helpers/react-element";

import { SignInControls } from "./sign-in-controls";

/**
 * The sign in controls (spec 0006, AC-7).
 *
 * The criterion is environment independent by design: it holds locally, on
 * preview and in production alike, because the page never links to `/sign-in`
 * at all. A unit test is therefore the right place for it, and the one below
 * would fail the moment somebody "helpfully" turned these labels back into
 * links, which is what the prototype had them as.
 */

const light = renderDeep(SignInControls({}), [
  Chip,
  Text,
  GoogleIcon,
  GitHubIcon,
]);
const dark = renderDeep(SignInControls({ tone: "dark" }), [
  Chip,
  Text,
  GoogleIcon,
  GitHubIcon,
]);

describe("the sign in controls", () => {
  it("names both providers (covers AC-7)", () => {
    expect(textOf(light)).toContain("Sign in with Google");
    expect(textOf(light)).toContain("Sign in with GitHub");
  });

  it("renders no anchor and no button, at either tone (covers AC-7)", () => {
    for (const tree of [light, dark]) {
      const interactive = [
        ...findAllByType(tree, "a"),
        ...findAllByType(tree, "button"),
      ];
      expect(interactive).toHaveLength(0);
    }
  });

  it("marks each provider with the status chip rather than a colour alone (covers AC-7)", () => {
    const chips = findAllByType(light, Chip);

    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect((chip.props as { readonly state?: string }).state).toBe("status");
      expect(textOf(chip)).toBe("soon");
    }
  });

  it("says accounts are not open yet, in the engineer's own words (COPY-1, covers AC-7)", () => {
    expect(textOf(light)).toContain(
      "Sign in isn't live yet. Coming soon with Google and GitHub.",
    );
  });

  it("carries both marks, so the providers read without the text too", () => {
    expect(findAllByType(light, GoogleIcon)).toHaveLength(1);
    expect(findAllByType(light, GitHubIcon)).toHaveLength(1);
  });
});

describe("the dark tone, on the sign in band", () => {
  /**
   * Not cosmetic. `--muted` on `--primary-800` measures about 2.2:1, well under
   * the WCAG 2.2 AA floor; `--primary-300` measures about 6.9:1. A tone that
   * silently kept the light colours would be unreadable rather than merely off.
   */
  it("lifts the note off the dark ground instead of leaving it muted (covers AC-14)", () => {
    const note = findAllByType(dark, Text).find((text) =>
      textOf(text).includes("isn't live yet"),
    );

    expect(classesOf(note)).toContain("text-primary-300");
  });

  it("changes nothing but the colours (covers AC-6)", () => {
    expect(textOf(dark)).toBe(textOf(light));
    expect(findAllByType(dark, Chip)).toHaveLength(
      findAllByType(light, Chip).length,
    );
  });
});
