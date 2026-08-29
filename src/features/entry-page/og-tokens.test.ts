import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { OG_COLOR_TOKENS, OG_COLORS } from "./og-tokens";

/**
 * Spec 0006, AC-16.
 *
 * The social preview image is rendered by Satori, which never sees a
 * stylesheet, so its colours have to be literals rather than token classes.
 * This is the guard on that duplication: it reads the real values out of
 * `globals.css` and fails if any of the five drifts.
 *
 * The guarded set is named in `og-tokens.ts` rather than discovered here, and
 * the two are cross checked below, so a sixth colour added to the image without
 * a matching CSS token fails rather than going untested. That is the difference
 * between a guard and a guard that can pass while missing the thing it exists
 * to catch.
 *
 * Same shape as `tv.test.ts`, which keeps the type scale honest against the
 * same file. Neither can PREVENT drift, only catch it; fix the CSS side first,
 * then copy across.
 */

/**
 * The custom properties declared in the top level `:root` block.
 *
 * Deliberately only that block: `globals.css` redefines some values under
 * `prefers-contrast` and `forced-colors`, and those are overrides for a
 * viewing mode, not the brand value the card should draw with.
 */
function rootTokens(): ReadonlyMap<string, string> {
  const css = readFileSync("src/app/globals.css", "utf8");
  const start = css.indexOf(":root {");
  expect(
    start,
    "globals.css no longer opens with a :root block",
  ).toBeGreaterThan(-1);

  const block = css.slice(start, css.indexOf("\n}", start));
  const tokens = new Map<string, string>();
  for (const match of block.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gm)) {
    const name = match[1];
    const value = match[2];
    /** `noUncheckedIndexedAccess` widens a matched group to possibly undefined. */
    if (name === undefined || value === undefined) continue;
    tokens.set(name, value.trim().toLowerCase());
  }
  return tokens;
}

describe("the preview image's colours", () => {
  it("names a CSS token for every colour the image draws with", () => {
    // covers: AC-16 · an unmapped colour would be silently untested below
    expect(Object.keys(OG_COLOR_TOKENS).sort()).toEqual(
      Object.keys(OG_COLORS).sort(),
    );
  });

  it.each(Object.entries(OG_COLOR_TOKENS))(
    "%s still matches %s in globals.css",
    (key, token) => {
      // covers: AC-16
      const tokens = rootTokens();
      const actual = tokens.get(token);

      expect(
        actual,
        `${token} is gone from globals.css, so the image is drawing a colour the design system no longer defines`,
      ).toBeDefined();

      expect(actual).toBe(
        OG_COLORS[key as keyof typeof OG_COLORS].toLowerCase(),
      );
    },
  );

  it("guards all five colours the spec names", () => {
    // covers: AC-16 · the count is asserted so a deletion cannot shrink the guard
    expect(Object.keys(OG_COLORS)).toHaveLength(5);
  });
});

/**
 * The committed font, and the licence that makes committing it lawful
 * (spec 0006, AC-15).
 *
 * The binary is the first redistributed third party asset this project carries,
 * and the risk is not that it goes missing (the generator's own guard fails the
 * build for that, loudly and by name). The risk is that it lands ALONE: a font
 * file with no licence beside it is the kind of thing that is only noticed by
 * somebody else, later.
 */
describe("the committed typeface", () => {
  const assets = fileURLToPath(new URL("../../../assets", import.meta.url));

  it("keeps the licence beside the binary, so neither can land without the other", () => {
    // covers: AC-15
    const files = readdirSync(assets);

    expect(files).toContain("SpaceGrotesk-SemiBold.ttf");
    expect(files).toContain("SpaceGrotesk-OFL.txt");
  });

  it("carries a licence that actually permits redistributing the font here", () => {
    // covers: AC-15 · the permission is the point, not the presence of a file
    const licence = readFileSync(`${assets}/SpaceGrotesk-OFL.txt`, "utf8");

    expect(licence).toContain("SIL Open Font License");
    expect(licence).toContain("Version 1.1");
    expect(licence).toMatch(/copy, merge, embed, modify,\s*redistribute/);
  });

  it("commits a real font file rather than an empty placeholder", () => {
    // covers: AC-15
    const bytes = readFileSync(`${assets}/SpaceGrotesk-SemiBold.ttf`);

    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });
});
