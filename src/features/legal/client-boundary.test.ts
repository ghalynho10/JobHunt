import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The client boundary guard (spec 0009, AC-1, AC-19, invariant 3).
 *
 * `"use client"` IS A PROPERTY OF A FILE, WHICH NO RENDERED TREE CAN SHOW. A
 * page test can call these components and read what comes back without ever
 * learning that one of them ships a JavaScript bundle to the browser, so the
 * only honest place to assert this is the source.
 *
 * WHY IT MATTERS ON THESE THREE ROUTES. `/terms` and `/privacy` are documents
 * nobody interacts with, so a bundle would be pure cost. `/sign-in` is the one
 * at real risk: the obvious way to build an acceptance line is a checkbox, a
 * checkbox needs state, and state would make the whole sign in page a client
 * component. Spec 0009 chose a static sentence instead, and this is what stops
 * that choice being quietly undone.
 */

const root = (path: string): string =>
  fileURLToPath(new URL(`../../../${path}`, import.meta.url));

/** Every non test `.ts` and `.tsx` file under a directory. */
function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name)) return [];
    if (/\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

const TREES = [
  "src/features/legal",
  "src/app/(marketing)/privacy",
  "src/app/(marketing)/terms",
  "src/app/(marketing)/sign-in",
] as const;

describe("nothing on these routes crosses the client boundary", () => {
  const files = TREES.flatMap((tree) => sourceFiles(root(tree)));

  it("walks the real files, so the check is not vacuous", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files.some((path) => path.endsWith("privacy-notice.tsx"))).toBe(
      true,
    );
    expect(
      files.some((path) => path.endsWith("sign-in/page.tsx")),
      "The sign in page is the one at real risk here. If this stops finding it, the guard has stopped guarding the thing it was written for.",
    ).toBe(true);
  });

  it("declares no client component (covers AC-1, AC-19)", () => {
    const offenders = files.filter((path) =>
      /^\s*["']use client["']/m.test(readFileSync(path, "utf8")),
    );

    expect(
      offenders,
      "These routes are static prerenders that ship no bundle. If interactivity is genuinely needed, open a narrow boundary in its own component and say why, rather than marking a whole page.",
    ).toEqual([]);
  });
});
