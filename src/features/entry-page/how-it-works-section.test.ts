import { describe, expect, it } from "vitest";

import { Heading } from "@/components/ui/heading";
import { MatchBar } from "@/components/ui/match-bar";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import {
  findAllByType,
  findByType,
  renderDeep,
  textOf,
} from "../../../test/helpers/react-element";

import { HowItWorksSection } from "./how-it-works-section";

const howItWorks = renderDeep(HowItWorksSection(), [
  Section,
  Heading,
  MatchBar,
  Text,
]);

describe("the how it works section", () => {
  it("runs compact on sunken with no divider (covers AC-2, AC-3)", () => {
    expect(findByType(howItWorks, Section)?.props).toMatchObject({
      weight: "compact",
      background: "sunken",
      divider: "none",
    });
  });

  it("opens on its heading alone, with no eyebrow (covers AC-1)", () => {
    const eyebrows = findAllByType(howItWorks, Text).filter(
      (text) =>
        (text.props as { readonly variant?: string }).variant === "eyebrow",
    );

    /** Only the three step numerals; the section opener eyebrow marks the two generous peaks. */
    expect(eyebrows.map((eyebrow) => textOf(eyebrow))).toEqual([
      "01",
      "02",
      "03",
    ]);
  });

  /**
   * Weakness #1 from the composition review: step 02 hand copied a bar at six
   * of eight beside a page that said eight of eleven. The real component
   * derives its own cells, so the picture cannot disagree with its inputs.
   */
  it("uses the real MatchBar in step 02, not a hand copied one (covers AC-1)", () => {
    const bars = findAllByType(howItWorks, MatchBar);

    expect(bars).toHaveLength(1);
    expect(bars[0]?.props).toMatchObject({ matched: 6, total: 8 });
  });

  it("names the step 02 bar as an example, so it is not read as a real score (covers AC-9)", () => {
    expect(
      (findByType(howItWorks, MatchBar)?.props as { readonly label?: string })
        .label,
    ).toContain("Example");
  });

  it("drops the five decorative filter pills the prose already names (covers AC-1)", () => {
    expect(textOf(howItWorks)).toContain("location,");
    expect(textOf(howItWorks)).not.toContain("Remote / hybrid");
  });

  it("renders three steps as equal peers", () => {
    expect(
      findAllByType(howItWorks, Heading).filter(
        (h) => (h.props as { readonly level?: number }).level === 3,
      ),
    ).toHaveLength(3);
  });
});
