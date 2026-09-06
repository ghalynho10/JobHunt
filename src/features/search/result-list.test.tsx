import { describe, expect, it } from "vitest";

import { flatten, renderDeep } from "../../../test/helpers/react-element";

import type { Listing } from "./adzuna";
import { ResultCard } from "./result-card";
import { ResultList } from "./result-list";

/**
 * The result list itself (spec 0013, AC-6; spec 0015, AC-9, AC-16).
 *
 * IT IS TESTED SEPARATELY FROM THE PAGE because the page cannot reach one of
 * its states. `/search` renders the pending list as a `<Suspense>` FALLBACK,
 * and a fallback is a prop rather than a child, so the walker in
 * `test/helpers/react-element.ts` never enters it. Testing this component
 * directly is what puts AC-16's `aria-busy` under a test at all rather than
 * leaving it to `/check verify` alone.
 */

const listing = (id: string): Listing =>
  ({
    source: "adzuna",
    sourceJobId: id,
    title: `Job ${id}`,
    companyName: "Acme",
    location: undefined,
    url: `https://www.adzuna.com/land/ad/${id}`,
    descriptionSnippet: undefined,
    salaryMin: undefined,
    salaryMax: undefined,
    salaryCurrency: undefined,
    salaryIsPredicted: false,
    postedAt: undefined,
  }) as Listing;

const now = new Date("2026-09-06T12:00:00Z");

/** Stopped at `ResultCard`, so its props stay readable rather than markup. */
const render = (element: React.ReactElement) =>
  renderDeep(element, [ResultCard]);

const items = (tree: unknown) =>
  flatten(tree as never).filter((element) => element.type === "li");

describe("the pending state (AC-16)", () => {
  it("marks a card whose score has not resolved as busy", () => {
    const tree = render(
      <ResultList
        rows={[{ listing: listing("1"), busy: true }]}
        now={now}
        appliedIds={undefined}
      />,
    );

    expect(
      (items(tree)[0]?.props as { "aria-busy"?: boolean })["aria-busy"],
    ).toBe(true);
  });

  it("puts no aria-busy at all on a card that is not waiting", () => {
    /**
     * THE COUNTERWEIGHT, and the reason it matters: `aria-busy="false"` on
     * every card would be a claim about loading state on a page where nothing
     * is loading, and it would let the assertion above pass on a list that
     * never actually distinguishes the two.
     */
    const tree = render(
      <ResultList
        rows={[{ listing: listing("1") }]}
        now={now}
        appliedIds={undefined}
      />,
    );

    expect(items(tree)[0]?.props).not.toHaveProperty("aria-busy");
  });
});

describe("ordering and identity (AC-9)", () => {
  it("renders rows in exactly the order it was handed, deciding none of its own", () => {
    const tree = render(
      <ResultList
        rows={[
          { listing: listing("3") },
          { listing: listing("1") },
          { listing: listing("2") },
        ]}
        now={now}
        appliedIds={undefined}
      />,
    );

    expect(items(tree).map((item) => item.key)).toEqual([
      "adzuna:3",
      "adzuna:1",
      "adzuna:2",
    ]);
  });

  it("keys each card by its listing, never by its position", () => {
    /**
     * AC-9 re-sorts this list exactly once. Keyed by index, React would reuse a
     * card's DOM for a different job the moment the order changed, so the
     * reader would see one posting's title above another posting's score with
     * nothing in the markup looking wrong.
     */
    const tree = render(
      <ResultList
        rows={[{ listing: listing("abc") }]}
        now={now}
        appliedIds={undefined}
      />,
    );

    expect(items(tree)[0]?.key).toBe("adzuna:abc");
  });
});

describe("the applied markers (spec 0014, AC-9)", () => {
  it("marks only the listings the caller has actually applied to", () => {
    const tree = render(
      <ResultList
        rows={[{ listing: listing("1") }, { listing: listing("2") }]}
        now={now}
        appliedIds={new Set(["2"])}
      />,
    );

    const cards = flatten(tree as never).filter(
      (element) => element.type === ResultCard,
    );

    expect(
      cards.map(
        (card) => (card.props as { alreadyApplied?: boolean }).alreadyApplied,
      ),
    ).toEqual([false, true]);
  });

  it("marks none of them when the read behind the markers failed", () => {
    const tree = render(
      <ResultList
        rows={[{ listing: listing("1") }]}
        now={now}
        appliedIds={undefined}
      />,
    );

    const cards = flatten(tree as never).filter(
      (element) => element.type === ResultCard,
    );

    expect(
      (cards[0]?.props as { alreadyApplied?: boolean }).alreadyApplied,
    ).toBe(false);
  });
});
