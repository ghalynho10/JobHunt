import { describe, expect, it } from "vitest";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { MatchBar } from "@/components/ui/match-bar";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import {
  findAllByType,
  findByType,
  flatten,
  renderDeep,
  textOf,
} from "../../../test/helpers/react-element";

import { HeroSection } from "./hero-section";

/**
 * The hero, and mainly its one real risk: the example card states the same
 * match three separate ways (a score badge, a bar, and a written summary) plus
 * two chip lists, and nothing but a test keeps them agreeing.
 *
 * That is not hypothetical here. The first version of this card hand wrote
 * "8 of 11" into the summary sentence and kept the gap notes in a second array
 * beside the skills, so editing the skill list moved the bar and left the
 * sentence and the notes behind. The composition review's original finding was
 * exactly this shape: a picture disagreeing with the number next to it.
 */

const hero = renderDeep(HeroSection(), [
  Section,
  Card,
  Card.Header,
  Card.Body,
  Card.Footer,
  Chip,
  MatchBar,
  Text,
]);

const chipsInState = (state: "matched" | "missing") =>
  findAllByType(hero, Chip).filter(
    (chip) => (chip.props as { readonly state?: string }).state === state,
  );

const bar = findByType(hero, MatchBar)?.props as
  { readonly matched: number; readonly total: number } | undefined;

describe("the example result card's numbers", () => {
  it("agrees with itself: bar, chips, badge and sentence all say the same match (covers AC-9)", () => {
    const matched = chipsInState("matched").length;
    const missing = chipsInState("missing").length;

    expect(bar?.matched).toBe(matched);
    expect(bar?.total).toBe(matched + missing);
    expect(textOf(hero)).toContain(`${matched} / ${matched + missing}`);
    expect(textOf(hero)).toContain(
      `${matched} of ${matched + missing} skills matched`,
    );
  });

  it("writes one gap note per missing skill, and none left over", () => {
    const notes = findAllByType(hero, Text).filter(
      (text) => (text.props as { readonly as?: string }).as === "li",
    );
    const missing = chipsInState("missing");

    expect(notes).toHaveLength(missing.length);
    for (const chip of missing) {
      const skill = textOf(chip);
      expect(notes.some((note) => textOf(note).startsWith(`${skill}:`))).toBe(
        true,
      );
    }
  });

  it("renders the specced 8 of 11, so the page and the preview card agree (covers AC-9)", () => {
    expect(bar).toMatchObject({ matched: 8, total: 11 });
  });
});

describe("the example result card's honesty", () => {
  it("carries the example label as an eyebrow and as the figure's name (covers AC-9)", () => {
    const figure = flatten(hero).find((element) => element.type === "figure");
    const eyebrows = findAllByType(hero, Text).filter(
      (text) =>
        (text.props as { readonly variant?: string }).variant === "eyebrow",
    );

    expect(
      (figure?.props as { readonly "aria-label"?: string })["aria-label"],
    ).toBe("Example result");
    expect(
      eyebrows.some((eyebrow) => textOf(eyebrow) === "Example result"),
    ).toBe(true);
  });

  it("wraps the card in a plain figure, never widening Card's `as` union (covers AC-1)", () => {
    const figure = flatten(hero).find((element) => element.type === "figure");
    const card = findByType(hero, Card);

    expect(figure).toBeDefined();
    expect((card?.props as { readonly as?: string }).as).toBeUndefined();
    expect(
      (figure?.props as { readonly className?: string }).className,
    ).toBeUndefined();
  });

  it("renders the apply control as text inside the footer, with no destination (covers AC-17)", () => {
    const apply = findAllByType(hero, Text).find((text) =>
      textOf(text).includes("Apply on the real posting"),
    );

    expect(apply).toBeDefined();
    expect((apply?.props as { readonly href?: string }).href).toBeUndefined();
    expect(findAllByType(hero, Card.Footer)).toHaveLength(1);
    expect(textOf(findByType(hero, Card.Footer))).toContain(
      "Apply on the real posting",
    );
  });

  it("is the page's one elevated card (covers AC-5)", () => {
    expect(
      (findByType(hero, Card)?.props as { readonly tone?: string }).tone,
    ).toBe("elevated");
  });
});

describe("the hero section itself", () => {
  it("opens generous on paper with no divider (covers AC-2, AC-3)", () => {
    const section = findByType(hero, Section)?.props as {
      readonly weight?: string;
      readonly background?: string;
      readonly divider?: string;
    };

    expect(section).toMatchObject({
      weight: "generous",
      background: "paper",
      divider: "none",
    });
  });

  it("uses the 60/40 split rather than an equal fraction grid (covers AC-1)", () => {
    const grid = flatten(hero).find((element) =>
      String(
        (element.props as { readonly className?: string }).className ?? "",
      ).includes("grid-split"),
    );

    expect(grid).toBeDefined();
  });
});
