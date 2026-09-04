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

/**
 * ADDED BY FEATURE 9 (spec 0010, AC-16), when `profile` became the first claim
 * to move from `planned` to `working`.
 *
 * THIS IS STILL NOT A TRUTH CHECK, and the header above still holds: whether the
 * card matches `docs/scope/scope.md` is a human read, because a test asserting
 * against the same prose would only encode the same reading twice. What is
 * checkable without reading the scope is the SHAPE of a move: a claim belongs to
 * exactly one row, and moving it means deleting it from one and adding it to the
 * other. Doing only half of that is the specific mistake four features in a row
 * are set up to make, and it is invisible on the page, because a claim listed
 * under both rows reads correctly in each.
 */
describe("moving a claim across is a move, not a copy (AC-16)", () => {
  /**
   * The two claim lines, working first and planned second, read off the card's
   * own rows. `monoData` is the register the card gives each line, so this finds
   * them by what they are rather than by their position in the markup.
   */
  const claimLines = findAllByType(about, Text).filter(
    (text) => (text.props as { variant?: string }).variant === "monoData",
  );

  const claimsOf = (row: 0 | 1): readonly string[] =>
    textOf(claimLines[row])
      .split("·")
      .map((claim) => claim.trim())
      .filter((claim) => claim.length > 0);

  const working = () => claimsOf(0);
  const planned = () => claimsOf(1);

  it("lists no claim under both working and planned", () => {
    /**
     * The half done move. Feature 7 left the opposite mistake on the live site
     * for two days (a placeholder that outlived the thing it stood in for), and
     * this is the same class of error in the other direction.
     */
    const both = working().filter((claim) => planned().includes(claim));

    expect(both, "a claim is either working or planned, never both").toEqual(
      [],
    );
  });

  it("has moved the profile claim to working, now that the form exists", () => {
    // covers: AC-16
    expect(working()).toContain("profile");
    expect(planned()).not.toContain("profile");
  });

  it("has moved the filtered search claim to working, now that search exists", () => {
    // covers: AC-16, and spec 0013's own AC-12
    expect(working()).toContain("filtered search");
    expect(planned()).not.toContain("filtered search");
  });

  it("still lists the three claims whose features have not shipped", () => {
    /**
     * Named individually so the next feature to ship has to come here and remove
     * its own, rather than the row quietly emptying or growing. Feature 11 did
     * exactly that on 2026-09-04, taking `filtered search` out of this list.
     */
    expect(planned()).toEqual([
      "ranked results with reasoning",
      "application tracking",
      "a no sign in demo account",
    ]);
  });
});
