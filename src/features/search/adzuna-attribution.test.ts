import { describe, expect, it } from "vitest";

import {
  flatten,
  renderDeep,
  textOf,
} from "../../../test/helpers/react-element";

import { ADZUNA_ATTRIBUTION_URL, ADZUNA_JOBSWORTH_URL } from "./adzuna";
import { AdzunaAttribution, JobsworthAttribution } from "./adzuna-attribution";

/**
 * Adzuna's two required attributions (spec 0013, AC-6 and AC-7).
 *
 * THESE ARE LICENCE TERMS, NOT STYLING, and that is why they are tested at all.
 * Everything else in this feature can be reworked freely; these two blocks
 * cannot, because Adzuna's terms of service are what permit this product to
 * use their data. A refactor that quietly drops the logo, unlinks a word, or
 * renames a link target is not a visual regression, it puts the app outside
 * the terms while still looking fine in review.
 *
 * WHAT THIS FILE CANNOT PROVE. The terms also set minimum rendered sizes (116
 * by 23 for the main block, 20 by 20 for the Jobsworth icon). A size is a
 * computed layout fact, and this project's unit project runs in `node` with no
 * browser (spec 0004). Those are measured in a real browser and recorded in
 * `docs/specs/0013-job-search-and-results-list/verify.md`. What is asserted
 * here is everything that is structural: which words exist, what they link to,
 * and that the mark carries a real accessible name.
 */

function anchors(node: unknown) {
  return flatten(node as never).filter((element) => element.type === "a");
}

function hrefOf(element: { props: unknown }) {
  return (element.props as { href?: string }).href;
}

describe("the Jobs by Adzuna attribution (AC-6)", () => {
  it("reads as the required phrase", () => {
    expect(textOf(AdzunaAttribution() as never)).toContain("Jobs");
    expect(textOf(AdzunaAttribution() as never)).toContain("by");
  });

  it("links the word Jobs to Adzuna", () => {
    const jobsLink = anchors(AdzunaAttribution()).find((element) =>
      textOf(element).includes("Jobs"),
    );

    expect(jobsLink).toBeDefined();
    expect(hrefOf(jobsLink!)).toBe(ADZUNA_ATTRIBUTION_URL);
  });

  it("links the logo separately, as its own anchor", () => {
    /**
     * TWO ANCHORS, NOT ONE WRAPPING BOTH, and the terms are the reason: each
     * of the two elements is required to be linked. A single anchor around the
     * whole phrase would swallow the unlinked "by" into the link text.
     */
    expect(anchors(AdzunaAttribution())).toHaveLength(2);
    for (const anchor of anchors(AdzunaAttribution())) {
      expect(hrefOf(anchor)).toBe(ADZUNA_ATTRIBUTION_URL);
    }
  });

  it("gives the mark a real accessible name rather than hiding it", () => {
    /**
     * The word "Adzuna" in the required phrase IS the image. Marking it
     * `aria-hidden` would leave a screen reader hearing "Jobs by", which reads
     * as a broken sentence and drops the attribution the terms require.
     */
    /**
     * `renderDeep` rather than `flatten`: the mark is its own small component
     * inside the attribution, so the tree has to be invoked before the `svg`
     * exists as an element to inspect.
     */
    const svg = flatten(renderDeep(AdzunaAttribution() as never)).find(
      (element) => element.type === "svg",
    );

    expect(svg).toBeDefined();
    const props = svg!.props as { role?: string; "aria-label"?: string };
    expect(props.role).toBe("img");
    expect(props["aria-label"]).toBe("Adzuna");
  });

  it("points at the country's own Adzuna domain", () => {
    // The terms allow "the relevant local domain"; the US country constant maps here.
    expect(ADZUNA_ATTRIBUTION_URL).toBe("https://www.adzuna.com");
  });
});

describe("the Jobsworth salary attribution (AC-7)", () => {
  it("names Adzuna Jobsworth in words", () => {
    expect(textOf(JobsworthAttribution() as never)).toContain(
      "Adzuna Jobsworth",
    );
  });

  it("links to the salary predictor page the terms quote", () => {
    /**
     * Asserted as a literal, not against a country map, on purpose: Adzuna's
     * terms state this URL with no "or relevant local domain" alternative,
     * unlike the main attribution clause. Spec 0013's Follow-up records that
     * it is fixed until somebody re reads the terms.
     */
    const [link] = anchors(JobsworthAttribution());

    expect(hrefOf(link!)).toBe(ADZUNA_JOBSWORTH_URL);
    expect(ADZUNA_JOBSWORTH_URL).toBe(
      "http://www.adzuna.co.uk/jobs/salary-predictor.html",
    );
  });

  it("carries the exact mouseover text the terms require", () => {
    const [link] = anchors(JobsworthAttribution());

    expect((link!.props as { title?: string }).title).toBe(
      "Salary estimate powered by Adzuna Jobsworth",
    );
  });

  it("hides its icon from screen readers, since the words already say it", () => {
    // The opposite call from the main mark above, and correct for the same
    // reason: here the name is carried by real text beside the icon.
    const svg = flatten(JobsworthAttribution() as never).find(
      (element) => element.type === "svg",
    );

    expect((svg!.props as { "aria-hidden"?: string })["aria-hidden"]).toBe(
      "true",
    );
  });

  it("opens both attributions in a new tab, safely", () => {
    // covers: AC-6, AC-7. `noopener` closes the window.opener handle.
    for (const anchor of [
      ...anchors(AdzunaAttribution()),
      ...anchors(JobsworthAttribution()),
    ]) {
      const props = anchor.props as { target?: string; rel?: string };
      expect(props.target).toBe("_blank");
      expect(props.rel).toContain("noopener");
      expect(props.rel).toContain("noreferrer");
    }
  });
});
