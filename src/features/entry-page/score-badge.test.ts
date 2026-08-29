import { describe, expect, it } from "vitest";

import { Text } from "@/components/ui/text";
import {
  classesOf,
  findByType,
  renderDeep,
  textOf,
} from "../../../test/helpers/react-element";

import { ScoreBadge } from "./score-badge";

/**
 * The score badge (spec 0006).
 *
 * Two rules meet here and both are easy to break by accident: the amber accent
 * is reserved for the score and nothing else (`globals.css`), and the type
 * scale is closed, so the prototype's 22px and 44px figures have to land on a
 * real step rather than an arbitrary size (spec 0005, AC-2).
 */

const render = (size?: "card" | "compare") =>
  renderDeep(ScoreBadge({ children: "8 / 11", size }), [Text]);

describe("the score badge", () => {
  it("renders the score it is given", () => {
    expect(textOf(render())).toBe("8 / 11");
  });

  it("uses the amber accent, the one place globals.css reserves it for", () => {
    expect(classesOf(findByType(render(), Text))).toContain("bg-accent-300");
  });

  it("reads as measured data, so it takes the mono register (covers AC-1)", () => {
    expect(
      (findByType(render(), Text)?.props as { readonly variant?: string })
        .variant,
    ).toBe("monoLabel");
  });

  it.each([
    ["card", "text-h3"],
    ["compare", "text-h2"],
  ] as const)(
    "sizes %s from the locked scale (%s), never an arbitrary value",
    (size, expected) => {
      expect(classesOf(findByType(render(size), Text))).toContain(expected);
    },
  );

  it("defaults to the in card size", () => {
    expect(classesOf(findByType(render(), Text))).toContain("text-h3");
  });

  it("carries no accessible name of its own, since the bar beside it announces the match", () => {
    const props = findByType(render(), Text)?.props as {
      readonly "aria-label"?: string;
    };

    expect(props["aria-label"]).toBeUndefined();
  });
});
