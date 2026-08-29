import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

/**
 * `next/font/google` is a build time transform: the real `Space_Grotesk()` is
 * substituted by Next's compiler and simply does not exist under `node`, so
 * importing the layout without this throws before a single assertion runs.
 *
 * This is a boundary mock, not a mock of anything we own. The layout uses only
 * the `variable` each font returns, and `globals.css` maps those names into
 * `--font-sans` and `--font-mono`; the type scale that depends on them is
 * already guarded by `tv.test.ts`. Nothing asserted below reads a font.
 */
vi.mock("next/font/google", () => ({
  Space_Grotesk: () => ({ variable: "--font-space-grotesk" }),
  JetBrains_Mono: () => ({ variable: "--font-jetbrains-mono" }),
}));

const { metadata } = await import("./layout");

/**
 * The link identity (spec 0006, AC-10 and AC-12).
 *
 * These are the values a recruiter's chat client reads when the link is pasted,
 * so they are worth pinning: they are invisible in the running page and nothing
 * else would notice if one went missing.
 *
 * The source of `metadataBase` is asserted by reading the file rather than the
 * resolved value, on purpose. `canonicalSiteUrl` is the production origin in
 * every environment, so a test that only checked the URL would pass just as
 * happily if someone swapped it for `currentOrigin()` and ran it locally, which
 * is the exact mistake spec 0002 forbids.
 */

const layoutSource = readFileSync(
  fileURLToPath(new URL("./layout.tsx", import.meta.url)),
  "utf8",
);

describe("the site's link identity", () => {
  it("titles the page, and gives later routes a suffix to inherit (covers AC-10)", () => {
    expect(metadata.title).toEqual({
      default: "JobHunt",
      template: "%s · JobHunt",
    });
  });

  it("describes the product in the words the spec settled on (covers AC-10)", () => {
    expect(metadata.description).toBe(
      "Ranks real job openings against your profile and shows which skills matched, which are missing, and why. Not a score you have to take on trust.",
    );
  });

  it("asks for the large card, since the image is 1200 by 630 (covers AC-10)", () => {
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("resolves metadataBase from canonicalSiteUrl, never a literal or the current origin (covers AC-10)", () => {
    /**
     * Comments are stripped first. The file's own doc comment says the words
     * "never `currentOrigin()`" to explain the rule, and a naive text search
     * fails on the sentence that documents the very thing it is checking.
     */
    const code = layoutSource
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(code).toMatch(/metadataBase:\s*new URL\(canonicalSiteUrl\)/);
    expect(code).not.toMatch(/metadataBase:\s*new URL\(["'`]http/);
    expect(code).not.toContain("currentOrigin");
    expect(code).toMatch(
      /import\s*\{[^}]*canonicalSiteUrl[^}]*\}\s*from\s*"@\/lib\/origin"/,
    );
  });
});

describe("staying out of the search index", () => {
  it("keeps robots off (covers AC-12)", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  /**
   * A `robots.ts` or `robots.txt` anywhere in `src/app` or `public` would
   * override the value above, silently and from a different file. AC-12 forbids
   * both, so the absence is asserted rather than assumed.
   */
  it("adds no robots route or file that could override it (covers AC-12)", () => {
    const roots = ["../../src/app", "../../public"];
    const offenders = roots.flatMap((root) => {
      const dir = fileURLToPath(new URL(root, import.meta.url));
      const walk = (path: string): readonly string[] =>
        readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
          entry.isDirectory()
            ? walk(`${path}/${entry.name}`)
            : /^robots\.(ts|js|txt)$/.test(entry.name)
              ? [`${path}/${entry.name}`]
              : [],
        );
      return walk(dir);
    });

    expect(offenders).toEqual([]);
  });
});
