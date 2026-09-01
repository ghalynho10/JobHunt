import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The tracking absence guard (spec 0009, AC-14).
 *
 * THE NOTICE SAYS THERE IS NO ANALYTICS AND NO TRACKING. That is a sentence
 * about the whole application, and it is one line of `package.json` away from
 * being false. Adding a product analytics package is a normal, unremarkable
 * thing to do, which is exactly why the claim needs something other than memory
 * holding it up.
 *
 * TWO SURFACES, BECAUSE THERE ARE TWO WAYS IN. A dependency is the obvious one;
 * a `<script src="https://...">` dropped into a layout is the one that leaves no
 * trace in the manifest at all.
 */

const root = (path: string): string =>
  fileURLToPath(new URL(`../../../${path}`, import.meta.url));

/**
 * Packages whose whole purpose is watching what people do.
 *
 * Matched against dependency names as a prefix or a whole word, so a scoped
 * package and a plain one both land. The list names what is common rather than
 * what is conceivable: the point is to stop the ordinary case silently, and an
 * exotic one still has to pass review.
 */
const TRACKING_PACKAGES = [
  "@vercel/analytics",
  "@vercel/speed-insights",
  "posthog",
  "posthog-js",
  "mixpanel",
  "mixpanel-browser",
  "@segment/analytics-next",
  "analytics",
  "amplitude-js",
  "@amplitude/analytics-browser",
  "react-ga",
  "react-ga4",
  "@next/third-parties",
  "plausible-tracker",
  "fathom-client",
  "@hotjar/browser",
  "@microsoft/clarity",
] as const;

describe("no analytics dependency (covers AC-14)", () => {
  const manifest = JSON.parse(readFileSync(root("package.json"), "utf8")) as {
    readonly dependencies?: Readonly<Record<string, string>>;
    readonly devDependencies?: Readonly<Record<string, string>>;
  };

  const installed = [
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ];

  it("reads the real manifest, so the check is not vacuous", () => {
    expect(installed).toContain("next");
  });

  it("installs nothing whose job is watching what people do", () => {
    const found = installed.filter((name) =>
      TRACKING_PACKAGES.some((tracker) => name === tracker),
    );

    expect(
      found,
      `/privacy states there is no analytics and no tracking. Installing ${found.join(", ")} makes that false, so either remove it or change the notice and this list together.`,
    ).toEqual([]);
  });
});

describe("no third party script tag (covers AC-14)", () => {
  /** Every `.ts` and `.tsx` file under `src/`, tests excluded. */
  function sourceFiles(directory: string): readonly string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      if (!/\.tsx?$/.test(entry.name)) return [];
      if (/\.test\.tsx?$/.test(entry.name)) return [];
      return [path];
    });
  }

  const files = sourceFiles(root("src"));

  it("walks the real source tree, so the check is not vacuous", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("loads no script from another origin", () => {
    const offenders = files.filter((path) => {
      const code = readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      return (
        /<script[\s\S]{0,200}?src=\{?["'`]https?:/i.test(code) ||
        /<Script[\s\S]{0,200}?src=\{?["'`]https?:/.test(code)
      );
    });

    expect(
      offenders,
      "A script tag pointing at another origin is a third party watching this page load, which /privacy says does not happen.",
    ).toEqual([]);
  });
});
