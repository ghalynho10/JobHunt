import { describe, expect, it } from "vitest";

import { Card } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { MatchBar } from "@/components/ui/match-bar";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import {
  classesOf,
  findAllByType,
  findByType,
  flatten,
  renderDeep,
} from "../../../test/helpers/react-element";

import { ReasoningSection } from "./reasoning-section";

const reasoning = renderDeep(ReasoningSection(), [
  Section,
  Card,
  Card.Header,
  Card.Body,
  Heading,
  MatchBar,
  Text,
]);

describe("the reasoning section", () => {
  it("carries the page's single hairline, on its shared background boundary (covers AC-3)", () => {
    expect(findByType(reasoning, Section)?.props).toMatchObject({
      background: "sunken",
      divider: "hairline",
      weight: "generous",
    });
  });

  /**
   * The prototype gave the JobHunt card a shadow, which argued the comparison
   * by decoration rather than by content. Any weight difference between two
   * cards being compared is a thumb on the scale, so they have to be identical.
   */
  it("renders both comparison cards flat and identical (covers AC-5)", () => {
    const cards = findAllByType(reasoning, Card);

    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect((card.props as { readonly tone?: string }).tone).toBe("flat");
    }
    expect(classesOf(cards[0])).toEqual(classesOf(cards[1]));
  });

  it("draws the single number bar as a different object from the match bar (covers AC-1)", () => {
    const bars = findAllByType(reasoning, MatchBar);
    const continuous = flatten(reasoning).find((element) =>
      classesOf(element).includes("rounded-full"),
    );

    expect(bars).toHaveLength(1);
    expect(continuous).toBeDefined();
    /** Thin and fully rounded, where the match cells are taller and squared. */
    expect(classesOf(continuous)).toContain("h-1");
    expect(classesOf(continuous)).not.toContain("rounded-sm");
  });

  it("hides the decorative bar from assistive technology, since the number is read out (covers AC-14)", () => {
    const continuous = flatten(reasoning).find((element) =>
      classesOf(element).includes("rounded-full"),
    );

    expect(
      (continuous?.props as { readonly "aria-hidden"?: string })["aria-hidden"],
    ).toBe("true");
  });

  it("shows the same 8 of 11 the hero card does (covers AC-5)", () => {
    expect(findByType(reasoning, MatchBar)?.props).toMatchObject({
      matched: 8,
      total: 11,
    });
  });
});
