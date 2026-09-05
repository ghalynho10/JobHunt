import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ADZUNA_GREEN,
  ADZUNA_MARK_PATH,
  ADZUNA_WORDMARK_PATH,
} from "./adzuna-logo-geometry";

/**
 * The drift guard on Adzuna's lifted logo geometry (spec 0013, AC-6).
 *
 * THE SVG FILE IS THE SOURCE OF TRUTH, and `adzuna-logo-geometry.ts` is a copy
 * of two paths out of it, inlined because no SVG loader is configured and a
 * licensed attribution must not depend on a second request succeeding. A copy
 * can drift from its source silently, and this is a supplied brand asset:
 * nudging a path by hand would be altering someone else's mark while still
 * claiming to display it, which is a terms problem rather than a visual one.
 *
 * Mirrors `src/components/ui/logo.test.ts`, which holds this project's own
 * mark to the same standard against `docs/design/logo/`.
 */

const svg = readFileSync("src/features/search/adzuna-logo.svg", "utf8");

describe("the Adzuna geometry has not drifted from adzuna-logo.svg", () => {
  /**
   * Without this, a reader that silently found nothing would turn both
   * assertions below into a check that the file contains two strings it was
   * handed, which passes cheerfully while proving nothing.
   */
  it("actually reads the asset, so the guard is not vacuous", () => {
    expect(svg).toContain("<svg");
    expect(svg.length).toBeGreaterThan(1000);
  });

  it("carries the wordmark path verbatim", () => {
    expect(svg).toContain(ADZUNA_WORDMARK_PATH);
  });

  it("carries the swirl path verbatim", () => {
    expect(svg).toContain(ADZUNA_MARK_PATH);
  });

  it("uses the brand green the asset itself states", () => {
    expect(svg).toContain(ADZUNA_GREEN);
  });
});
