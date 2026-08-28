import { describe, expect, it } from "vitest";

import { findByType, textOf } from "../../../test/helpers/react-element";

import { Chip } from "./chip";
import { CheckIcon, GapIcon } from "./icons";

/**
 * Spec 0005, AC-13 and the fill versus outline grammar `brand-tokens.md` calls
 * the signature element.
 *
 * The point of these tests is that colour is never the only channel. A teal
 * fill and a grey outline are the same shape to a reader with a colour vision
 * difference, and in a forced palette both fills are discarded outright, so the
 * icon is what actually carries the state. The chip renders it itself rather
 * than taking it as a prop, which is only a guarantee if this holds.
 */
describe("Chip carries its state by shape, not colour alone", () => {
  it("renders a check on a matched skill", () => {
    // covers: AC-13
    const chip = Chip({ state: "matched", children: "Go" });

    expect(findByType(chip, CheckIcon)).toBeDefined();
    expect(findByType(chip, GapIcon)).toBeUndefined();
  });

  it("renders a dashed gap circle on a missing skill", () => {
    // covers: AC-13
    const chip = Chip({ state: "missing", children: "Kafka" });

    expect(findByType(chip, GapIcon)).toBeDefined();
    expect(findByType(chip, CheckIcon)).toBeUndefined();
  });

  it("renders no skill icon on a status badge, which is not a skill", () => {
    const chip = Chip({ state: "status", children: "Soon" });

    expect(findByType(chip, CheckIcon)).toBeUndefined();
    expect(findByType(chip, GapIcon)).toBeUndefined();
  });

  it("keeps the label readable in every state", () => {
    for (const state of ["matched", "missing", "status"] as const) {
      expect(textOf(Chip({ state, children: "Terraform" }))).toBe("Terraform");
    }
  });

  it("defaults to matched, so a forgotten prop cannot invent a gap", () => {
    // A gap the profile does not have is a worse default than a match it does.
    expect(findByType(Chip({ children: "Go" }), CheckIcon)).toBeDefined();
  });
});
