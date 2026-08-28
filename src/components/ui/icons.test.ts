import { describe, expect, it } from "vitest";

import { flatten } from "../../../test/helpers/react-element";

import {
  CheckIcon,
  ExternalLinkIcon,
  GapIcon,
  GitHubIcon,
  GoogleIcon,
} from "./icons";

/**
 * Spec 0005, AC-11 and AC-13.
 *
 * Every icon here sits beside text that already says what it means, so each is
 * decorative and must be hidden from assistive technology. An icon that is NOT
 * hidden reads its way into the accessible name of whatever contains it, which
 * is how a chip labelled "Go" starts announcing itself as something else.
 */
const ICONS = [
  { name: "CheckIcon", Icon: CheckIcon },
  { name: "GapIcon", Icon: GapIcon },
  { name: "GitHubIcon", Icon: GitHubIcon },
  { name: "GoogleIcon", Icon: GoogleIcon },
  { name: "ExternalLinkIcon", Icon: ExternalLinkIcon },
] as const;

describe("the icon set", () => {
  it("has all five the spec names", () => {
    // covers: AC-11
    expect(ICONS).toHaveLength(5);
    for (const { Icon } of ICONS) expect(typeof Icon).toBe("function");
  });

  it.each(ICONS)("$name is hidden from assistive technology", ({ Icon }) => {
    // covers: AC-13
    expect((Icon({}).props as { "aria-hidden": string })["aria-hidden"]).toBe(
      "true",
    );
  });

  it.each(ICONS)("$name carries a default size", ({ Icon }) => {
    // A missing default renders an SVG at whatever size the container implies,
    // which is usually enormous.
    const { className } = Icon({}).props as { className?: string };

    expect(className).toBeDefined();
    expect(className).toMatch(/h-/);
  });

  it.each(ICONS)("$name lets the caller resize it", ({ Icon }) => {
    expect(
      (Icon({ className: "h-8 w-8" }).props as { className: string }).className,
    ).toBe("h-8 w-8");
  });
});

describe("icon colour", () => {
  it.each([
    { name: "CheckIcon", Icon: CheckIcon },
    { name: "GapIcon", Icon: GapIcon },
    { name: "GitHubIcon", Icon: GitHubIcon },
    { name: "ExternalLinkIcon", Icon: ExternalLinkIcon },
  ] as const)("$name inherits the colour of the text beside it", ({ Icon }) => {
    // currentColor is what lets one icon work on paper and on the dark sign in
    // band without a variant. A pinned colour would be invisible on one of them.
    const svg = JSON.stringify(flatten(Icon({})).map((el) => el.props));

    expect(svg).toContain("currentColor");
  });

  it("keeps Google's four brand colours, which its guidelines require", () => {
    // covers: AC-11. The one icon that must NOT take currentColor.
    const fills = flatten(GoogleIcon({}))
      .map((el) => (el.props as { fill?: string }).fill)
      .filter((fill): fill is string => fill?.startsWith("#") ?? false);

    expect(new Set(fills)).toEqual(
      new Set(["#4285F4", "#34A853", "#FBBC05", "#EA4335"]),
    );
  });
});
