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

/**
 * Spec 0023, AC-9. The `editable` state, and the `action` and `pendingRemoval`
 * props it alone accepts, added for the chip input feature.
 */
describe("the editable state a chip field builds (spec 0023)", () => {
  it("renders no verdict icon, since a typed chip is neither a match nor a gap", () => {
    // covers: AC-9
    const chip = Chip({ state: "editable", children: "React" });

    expect(findByType(chip, CheckIcon)).toBeUndefined();
    expect(findByType(chip, GapIcon)).toBeUndefined();
  });

  it("keeps the three verdict states unchanged when no action is passed", () => {
    /**
     * The regression case: adding `editable` must not touch the three states
     * that already existed, so this pins the same assertions the tests above
     * already make, once more, against the extended union.
     */
    for (const state of ["matched", "missing", "status"] as const) {
      expect(textOf(Chip({ state, children: "Terraform" }))).toBe("Terraform");
    }

    expect(
      findByType(Chip({ state: "matched", children: "Go" }), CheckIcon),
    ).toBeDefined();
    expect(
      findByType(Chip({ state: "missing", children: "Kafka" }), GapIcon),
    ).toBeDefined();
  });

  it("renders the given action node beside the label", () => {
    // covers: AC-9
    const chip = Chip({
      state: "editable",
      action: "remove-control",
      children: "React",
    });

    expect(textOf(chip)).toBe("Reactremove-control");
  });

  it("renders no action when none is given", () => {
    const chip = Chip({ state: "editable", children: "React" });

    expect(textOf(chip)).toBe("React");
  });
});

/**
 * Spec 0023, AC-9. These are compile time assertions, matching the technique
 * `button.test.ts` already uses for `ButtonAsLink`'s forbidden combinations:
 * `@ts-expect-error` fails `tsc --noEmit` if the error it expects stops
 * happening, so this suite goes red the moment `action`/`pendingRemoval` are
 * reachable from a verdict chip. Props are hoisted to a named object first,
 * because a spread defeats excess property checking otherwise, and each
 * `@ts-expect-error` call stays on one line, since the directive only
 * suppresses the line directly beneath it (`src/components/ui/AGENTS.md`,
 * Testing section).
 */
describe("Chip forbids action and pendingRemoval on a verdict chip", () => {
  const MATCHED = { state: "matched", children: "Go" } as const;

  it("rejects action on a matched chip", () => {
    // @ts-expect-error `action` is `never` on a verdict chip, see ChipAsVerdict
    const call = () => Chip({ ...MATCHED, action: "x" });

    expect(call).toBeTypeOf("function");
  });

  it("rejects pendingRemoval on a matched chip", () => {
    // @ts-expect-error `pendingRemoval` is `never` on a verdict chip too
    const call = () => Chip({ ...MATCHED, pendingRemoval: true });

    expect(call).toBeTypeOf("function");
  });

  it("rejects action on a chip with no state at all (defaults to matched)", () => {
    // @ts-expect-error the default branch is still a verdict chip
    const call = () => Chip({ children: "Go", action: "x" });

    expect(call).toBeTypeOf("function");
  });

  it("still allows every legitimate editable combination", () => {
    // The guard is worthless if it also blocks ordinary use, so pin that too.
    expect(Chip({ state: "editable", children: "Go", action: "x" }).type).toBe(
      "span",
    );
    expect(
      Chip({
        state: "editable",
        children: "Go",
        action: "x",
        pendingRemoval: true,
      }).type,
    ).toBe("span");
  });
});
