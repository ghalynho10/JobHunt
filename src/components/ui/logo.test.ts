import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { flatten } from "../../../test/helpers/react-element";

import { Logo } from "./logo";

/**
 * Spec 0006, AC-1 and AC-14.
 *
 * Two things are worth locking here. The first is the accessible naming rule:
 * a logo is decorative inside a link that already says "JobHunt" and is the
 * name when it stands alone, and getting that backwards either doubles the name
 * or leaves a footer logo silent. The second is drift against the real asset,
 * the same guard `tv.test.ts` puts between the type scale and `globals.css`:
 * the mark's geometry lives in `docs/design/logo/mark.svg`, this component
 * holds a copy, and a copy nobody checks is a copy that goes stale.
 */

type SvgProps = {
  readonly "aria-hidden"?: string;
  readonly role?: string;
  readonly "aria-label"?: string;
  readonly viewBox?: string;
  readonly className?: string;
};

const propsOf = (node: ReturnType<typeof Logo>) => node.props as SvgProps;

/** Every `<rect>` the component actually renders, as plain geometry. */
function renderedRects(node: ReturnType<typeof Logo>) {
  return flatten(node)
    .filter((element) => element.type === "rect")
    .map((element) => {
      const p = element.props as Record<string, number>;
      return { x: p.x, y: p.y, width: p.width, height: p.height };
    });
}

/** The same geometry, read out of the committed asset rather than recalled. */
function assetRects() {
  const svg = readFileSync("docs/design/logo/mark.svg", "utf8");
  return [
    ...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g),
  ].map(([, x, y, width, height]) => ({
    x: Number(x),
    y: Number(y),
    width: Number(width),
    height: Number(height),
  }));
}

describe("Logo", () => {
  it("renders both cuts the spec names", () => {
    // covers: AC-1
    expect(propsOf(Logo({ variant: "lockup" })).viewBox).toBe(
      "0 0 484.26 71.4",
    );
    expect(propsOf(Logo({ variant: "mark" })).viewBox).toBe("0 0 32 32");
  });

  it("defaults to the lockup", () => {
    // covers: AC-1
    expect(propsOf(Logo({})).viewBox).toBe(
      propsOf(Logo({ variant: "lockup" })).viewBox,
    );
  });

  it("is decorative and hidden when no label is given", () => {
    // covers: AC-14
    for (const variant of ["lockup", "mark"] as const) {
      const props = propsOf(Logo({ variant }));
      expect(props["aria-hidden"]).toBe("true");
      // A hidden node must not also claim to be an image; the pair contradicts.
      expect(props.role).toBeUndefined();
      expect(props["aria-label"]).toBeUndefined();
    }
  });

  it("is a named image when it stands alone", () => {
    // covers: AC-14
    const props = propsOf(Logo({ label: "JobHunt" }));
    expect(props.role).toBe("img");
    expect(props["aria-label"]).toBe("JobHunt");
    expect(props["aria-hidden"]).toBeUndefined();
  });

  it("draws the same five rectangles in both cuts", () => {
    // covers: AC-1 · the two cuts share one definition, so they cannot diverge
    expect(renderedRects(Logo({ variant: "mark" }))).toHaveLength(5);
    expect(renderedRects(Logo({ variant: "lockup" }))).toEqual(
      renderedRects(Logo({ variant: "mark" })),
    );
  });

  it("has not drifted from docs/design/logo/mark.svg", () => {
    // covers: AC-1 · the asset is the source of truth, this file holds a copy
    expect(renderedRects(Logo({ variant: "mark" }))).toEqual(assetRects());
  });

  it("scales the mark grid onto the wordmark height in the lockup", () => {
    // covers: AC-1 · the 32 unit grid must be scaled, not redrawn at 70 units
    const group = flatten(Logo({ variant: "lockup" })).find(
      (element) => element.type === "g",
    );
    expect((group?.props as { transform?: string }).transform).toBe(
      "scale(2.1875)",
    );
  });

  it("the wordmark has not drifted from docs/design/logo/lockup.svg", () => {
    // covers: AC-1 · the geometry is now shared with the preview image
    // generator, so a stale copy here would show up on the social card too
    const svg = readFileSync("docs/design/logo/lockup.svg", "utf8");
    const asset = /<path transform="translate\(([\d.]+) 0\)" d="([^"]+)"/.exec(
      svg,
    );
    expect(
      asset,
      "lockup.svg no longer holds a translated wordmark path",
    ).not.toBeNull();

    const path = flatten(Logo({ variant: "lockup" })).find(
      (element) => element.type === "path",
    );
    const props = path?.props as { d?: string; transform?: string };

    expect(props.d).toBe(asset?.[2]);
    expect(props.transform).toBe(`translate(${asset?.[1]} 0)`);
  });

  it("sets the wordmark as outlined paths, so no font is needed", () => {
    // covers: AC-1 · see logo.tsx; this is what lets the preview image use it
    const paths = flatten(Logo({ variant: "lockup" })).filter(
      (element) => element.type === "path",
    );
    expect(paths).toHaveLength(1);
    expect((paths[0]?.props as { d?: string }).d ?? "").toMatch(
      /^M23\.19 71\.4/,
    );
    // The mark alone carries no wordmark.
    expect(
      flatten(Logo({ variant: "mark" })).filter(
        (element) => element.type === "path",
      ),
    ).toHaveLength(0);
  });
});
