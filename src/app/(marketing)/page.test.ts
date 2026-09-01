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
    /**
     * SPEC 0008, AC-18: `#start` is gone and `/go` has taken its place. The
     * header used to jump to the sign in band, which no longer signs anybody in,
     * so a jump there would be a link to a place that stopped doing the thing
     * the link promised. `/go` is a real route (`src/app/go/route.ts`).
     */
    expect([...hrefsOnThePage()].sort()).toEqual(
      [
        "#about",
        "#how-it-works",
        "#reasoning",
        "/",
        "/go",
        "/go",
        "/go",
      ].sort(),
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
   * SPEC 0008, AC-18, AND THIS ASSERTION IS THE INVERSE OF THE ONE IT REPLACES.
   * Spec 0007 put four provider forms on this page and this test counted them.
   * There are now zero: `/` is a static page that reads no session, so it cannot
   * tell whether the person reading it is already signed in, and it was
   * inviting all of them to sign in. The invitation moves to `/sign-in`, behind
   * the door, and the count going to zero is what proves the page stopped
   * guessing.
   */
  it("renders no form at all, and no sign in invitation (covers AC-18)", () => {
    const forms = flatten(page).filter((element) => element.type === "form");

    expect(forms).toHaveLength(0);

    /**
     * The controls themselves are gone, which is the checkable half. The band's
     * remaining sentence still describes what JobHunt uses to sign people in;
     * that is the engineer's copy and this feature does not reword it.
     */
    const buttons = findAllByType(page, Button);

    for (const button of buttons) {
      expect(textOf(button)).not.toContain("Sign in with");
    }
  });

  /**
   * The door replaces the jump, in both the header and the body, and both point
   * at the same route. `COPY-4` and `COPY-5` carry the same sentence
   * deliberately: two controls doing the same thing should not suggest two
   * destinations.
   */
  it("sends both door controls to the door route (covers AC-17, AC-18)", () => {
    const doors = findAllByType(page, Button).filter(
      (b) => (b.props as { readonly href?: string }).href === "/go",
    );

    /**
     * Three: the header control, and the two the provider controls used to
     * occupy, in the hero and in the closing band.
     */
    expect(doors).toHaveLength(3);
    for (const door of doors) {
      expect(textOf(door)).toContain("Open JobHunt");
      /**
       * `/go` is a redirect whose destination differs per visitor, so
       * prefetching it would run the landing rule on hover, before anyone asked
       * to go anywhere.
       */
      expect((door.props as { readonly prefetch?: unknown }).prefetch).toBe(
        false,
      );
    }
  });

  it("no longer jumps the header at the sign in band (covers AC-18)", () => {
    /**
     * The band still exists and still says what this costs; what it no longer
     * does is sign anybody in, so a control pointing at it would promise
     * something it stopped delivering.
     */
    expect(hrefsOnThePage()).not.toContain("#start");
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
