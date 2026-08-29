import { describe, expect, it } from "vitest";

import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import {
  findAllByType,
  findByType,
  renderDeep,
  textOf,
} from "../../../test/helpers/react-element";

import { AboutSection } from "./about-section";

/**
 * The about section and its status card (spec 0006).
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT TEST: whether the card's two lists are
 * TRUE. AC-8's own critical test scenario calls that a human read, because the
 * source is prose in `docs/scope/scope.md` and a test asserting against it
 * "would only encode the same reading twice": the same mistake would have to be
 * made twice to be caught, which is no guard at all. The truth check lives in
 * `verify.md` and is `/check verify`'s job. What IS tested here is the card's
 * shape, which is what the four owning features (9, 11, 12 and 14) will edit
 * when they move their claim across.
 */

const about = renderDeep(AboutSection(), [
  Section,
  Card,
  Card.Header,
  Card.Body,
  Chip,
  Heading,
  Text,
]);

describe("the about section", () => {
  it("runs standard on paper with no divider (covers AC-2, AC-3)", () => {
    expect(findByType(about, Section)?.props).toMatchObject({
      weight: "standard",
      background: "paper",
      divider: "none",
    });
  });

  it("renders the status card flat, like every card but the hero (covers AC-5)", () => {
    expect(
      (findByType(about, Card)?.props as { readonly tone?: string }).tone,
    ).toBe("flat");
  });
});

describe("the status card's shape", () => {
  it("keeps both rows, so a shipping feature has a row to move its claim into (covers AC-8)", () => {
    const chips = findAllByType(about, Chip);

    expect(chips.map((chip) => textOf(chip))).toEqual(["working", "planned"]);
  });

  it("tells the two rows apart by shape, not by colour alone (covers AC-14)", () => {
    const states = findAllByType(about, Chip).map(
      (chip) => (chip.props as { readonly state?: string }).state,
    );

    expect(states).toEqual(["matched", "missing"]);
  });

  it("keeps every claim on the card as plain text, never as a link (covers AC-7)", () => {
    expect(findAllByType(about, "a")).toHaveLength(0);
  });

  /**
   * Not a truth check (see the file header), but the one removal AC-8 states
   * outright: `email digests` was never a planned feature, only a deferred
   * idea, so it must not reappear on the card by being copied back from the
   * prototype.
   */
  it("never lists email digests, which has no scope row at all (covers AC-8)", () => {
    expect(textOf(about).toLowerCase()).not.toContain("email digest");
  });
});
