import Link from "next/link";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { MatchBar } from "@/components/ui/match-bar";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import {
  findAllByType,
  flatten,
  renderDeep,
  textOf,
} from "../../../test/helpers/react-element";

import HomePage from "./page";

/**
 * The composed entry page (spec 0006).
 *
 * These are the criteria that CANNOT be proved one component at a time, because
 * they are properties of the whole page: how many hairlines exist across all
 * five sections, how many elevated cards, whether any control that cannot work
 * is a link. A section module passing on its own tells you nothing about them.
 *
 * The page is invoked down to the design system boundary and no further (see
 * `renderDeep`), so `Section` and `Card` are still elements carrying the props
 * the criteria are written against, rather than class strings.
 */

/** The design system boundary: invoked no further, so their props stay readable. */
const BASE = [Section, Card, Button, Text, MatchBar, Logo, Link];

/**
 * Every real anchor on the page, however it was written. `Button` covers the
 * three nav jumps and Sign in; the home lockup is a bare `next/link`, and a
 * query that only knew about `Button` would miss it and quietly under report
 * what the page links to.
 */
function anchorsOnThePage() {
  return [
    ...findAllByType(page, Button),
    ...findAllByType(page, Link),
    /**
     * Raw `<a>` too, and that is not paranoia: a mutation test proved this
     * blind without it. Turning a provider label back into a plain
     * `<a href="/sign-in">`, which is precisely the prototype's bug, slipped
     * past a query that only knew about `Button` and `next/link`. The page's
     * rule is about anchors, so the query has to be about anchors.
     */
    ...findAllByType(page, "a"),
  ].filter(
    (element) =>
      (element.props as { readonly href?: string }).href !== undefined,
  );
}

function hrefsOnThePage(): readonly string[] {
  return anchorsOnThePage().map(
    (element) => (element.props as { readonly href: string }).href,
  );
}

const page = renderDeep(HomePage(), BASE);
const sections = findAllByType(page, Section);

type SectionProps = {
  readonly id?: string;
  readonly weight?: string;
  readonly background?: string;
  readonly divider?: string;
  readonly className?: string;
};

const propsOf = (index: number) => sections[index]?.props as SectionProps;

describe("the entry page's five sections", () => {
  it("renders exactly five body sections, in the specced order (covers AC-2)", () => {
    expect(sections.map((s) => (s.props as SectionProps).id)).toEqual([
      undefined,
      "how-it-works",
      "reasoning",
      "about",
      "start",
    ]);
  });

  /**
   * The tiers spec 0005's rationale assigned, carried forward by spec 0006
   * AC-2. Written as one table so a changed tier fails on the section it
   * changed, rather than on a count.
   */
  it.each([
    [0, "hero", "generous"],
    [1, "how it works", "compact"],
    [2, "the reasoning", "generous"],
    [3, "about", "standard"],
    [4, "sign in", "standard"],
  ])(
    "gives section %i (%s) the %s rhythm (covers AC-2)",
    (index, _name, weight) => {
      expect(propsOf(index).weight).toBe(weight);
    },
  );

  it("alternates paper, sunken, sunken, paper, then the dark band (covers AC-3)", () => {
    expect(
      sections.slice(0, 4).map((s) => (s.props as SectionProps).background),
    ).toEqual(["paper", "sunken", "sunken", "paper"]);
    /**
     * The band is the one ground `Section` does not enumerate, so it arrives as
     * a `className` override. AC-3 lists it separately for that reason.
     */
    expect(propsOf(4).className).toContain("bg-primary-800");
  });

  /**
   * THE LOAD BEARING ONE. Spec 0005's adjacency rule is caller enforced and no
   * component can see its siblings, so nothing but this catches a second
   * hairline creeping in when the alternation is edited.
   */
  it("draws exactly one hairline, on the only boundary that needs it (covers AC-3)", () => {
    const withHairline = sections.filter(
      (s) => (s.props as SectionProps).divider === "hairline",
    );

    expect(withHairline).toHaveLength(1);
    expect((withHairline[0]?.props as SectionProps).id).toBe("reasoning");
  });

  it("puts that hairline between the two sections that share a background (covers AC-3)", () => {
    const hairlineIndex = sections.findIndex(
      (s) => (s.props as SectionProps).divider === "hairline",
    );
    const previous = propsOf(hairlineIndex - 1).background;

    expect(propsOf(hairlineIndex).background).toBe(previous);
  });

  it("takes no divider anywhere the background already changes (covers AC-3)", () => {
    const backgrounds = sections.map(
      (s) => (s.props as SectionProps).background ?? "band",
    );
    const dividers = sections.map((s) => (s.props as SectionProps).divider);

    sections.forEach((_section, index) => {
      if (index === 0) return;
      if (backgrounds[index] !== backgrounds[index - 1]) {
        expect(dividers[index]).toBe("none");
      }
    });
  });
});

describe("the entry page's card idioms", () => {
  it("renders exactly one elevated card, and it is the hero result (covers AC-5)", () => {
    const cards = findAllByType(page, Card);
    const elevated = cards.filter(
      (c) => (c.props as { readonly tone?: string }).tone === "elevated",
    );

    expect(cards.length).toBeGreaterThanOrEqual(4);
    expect(elevated).toHaveLength(1);
    expect(textOf(elevated[0])).toContain("Senior Backend Engineer");
  });

  it("renders every other card flat (covers AC-5)", () => {
    const others = findAllByType(page, Card).filter(
      (c) => !textOf(c).includes("Senior Backend Engineer"),
    );

    for (const card of others) {
      expect((card.props as { readonly tone?: string }).tone).toBe("flat");
    }
  });
});

describe("the entry page's links", () => {
  /**
   * The page's one rule with no exceptions: nothing that cannot work is a link
   * (spec 0006, AC-7 and AC-17 together). Asserted over the WHOLE page rather
   * than per section, because the rule is about the page.
   */
  it("renders links only to destinations that exist (covers AC-7, AC-17)", () => {
    expect([...hrefsOnThePage()].sort()).toEqual(
      ["#about", "#how-it-works", "#reasoning", "#start", "/"].sort(),
    );
  });

  it("points every in page anchor at a section that exists (covers AC-7)", () => {
    const ids = sections.map((section) => (section.props as SectionProps).id);
    const fragments = hrefsOnThePage().filter((href) => href.startsWith("#"));

    expect(fragments.length).toBeGreaterThan(0);
    for (const fragment of fragments) {
      expect(ids).toContain(fragment.slice(1));
    }
  });

  /**
   * SPLIT BY SPEC 0007, AC-16, AND THE SPLIT IS THE POINT. This was one table
   * covering three controls that all had nowhere to go. Two of them now do:
   * sign in is real. The third does not and never did, so its half survives
   * unchanged and spec 0006 AC-17 keeps a test.
   *
   * Merging them back would either weaken the apply assertion or reassert
   * something about sign in that is no longer true.
   */
  it("renders the apply control as a label, never as a link (covers AC-17)", () => {
    const label = "Apply on the real posting";
    const asLink = anchorsOnThePage().some((element) =>
      textOf(element).includes(label),
    );

    expect(asLink).toBe(false);
    expect(textOf(page)).toContain(label);
  });

  /**
   * The other half, inverted. The provider controls are real submits now, and
   * they are still not ANCHORS, which matters for a different reason than
   * before: a sign in that navigated by link would be a GET, and this handshake
   * starts with a POST to a Server Action.
   */
  it.each(["Sign in with Google", "Sign in with GitHub"])(
    "renders %s as a real submit, not as a link (covers AC-16)",
    (label) => {
      const asLink = anchorsOnThePage().some((element) =>
        textOf(element).includes(label),
      );

      expect(asLink).toBe(false);
      expect(textOf(page)).toContain(label);
    },
  );

  /**
   * Asserted at PAGE level, not only per component, because the rule AC-16
   * carries is about the page: every provider control the page renders posts to
   * a server action. The controls appear twice, in the hero and in the band, and
   * a component test cannot see that there are two of each.
   */
  it("posts every provider control to a server action (covers AC-16)", () => {
    const forms = flatten(page).filter((element) => element.type === "form");

    expect(forms).toHaveLength(4);
    for (const form of forms) {
      expect((form.props as { readonly action?: unknown }).action).toBeTypeOf(
        "function",
      );
    }
  });

  it("keeps the header's sign in jump pointing at a section that exists (covers AC-7)", () => {
    const jump = findAllByType(page, Button).find(
      (b) => (b.props as { readonly href?: string }).href === "#start",
    );

    expect(jump).toBeDefined();
    expect(sections.some((s) => (s.props as SectionProps).id === "start")).toBe(
      true,
    );
  });
});

describe("the entry page's example result", () => {
  it("labels the hero card as an illustration, twice over (covers AC-9)", () => {
    const figure = flatten(page).find((element) => element.type === "figure");

    expect(
      (figure?.props as { readonly "aria-label"?: string })["aria-label"],
    ).toBe("Example result");
    expect(textOf(figure)).toContain("Example result");
  });

  it("keeps the job role in the figcaption, not the example label (covers AC-9)", () => {
    const figcaption = flatten(page).find(
      (element) => element.type === "figcaption",
    );

    expect(textOf(figcaption)).toBe("Senior Backend Engineer");
  });

  it("renders one figcaption only, which is all HTML allows", () => {
    expect(
      flatten(page).filter((element) => element.type === "figcaption"),
    ).toHaveLength(1);
  });
});

describe("the entry page's footer", () => {
  it("holds the lockup and the copyright and nothing between them (covers AC-13)", () => {
    const footer = flatten(page).find((element) => element.type === "footer");
    const row = (footer?.props as { readonly children?: ReactNode }).children;
    const inner = flatten(row)[0];
    const slots = (inner?.props as { readonly children?: readonly unknown[] })
      .children;

    expect(Array.isArray(slots) ? slots.length : 0).toBe(2);
    expect(textOf(footer)).toContain("© Ghaly Nicolas Jules");
    expect(findAllByType(footer, Logo)).toHaveLength(1);
  });
});
