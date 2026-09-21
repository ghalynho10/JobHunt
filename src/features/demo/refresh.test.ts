import { describe, expect, it } from "vitest";

import { ADZUNA_SOURCE } from "@/lib/adzuna";
import type { DedupFields } from "@/lib/listing-dedup";
import type { Listing } from "@/features/search/adzuna";

import { EVERPURE_PAIR } from "../../../test/fixtures/everpure-pair";

import { DEMO_SEARCHES, KEPT_LISTING_COUNT, keepListings } from "./refresh";

/**
 * The alternating keep walk (spec 0021, AC-7 and AC-17, revised 2026-09-15).
 *
 * WHY THIS FILE EXISTS. The walk is the one rule on this feature that decides
 * WHICH real listings the public page shows, and the whole 2026-09-14 rework
 * rests on that choice being made before any score exists. A walk that quietly
 * reordered, padded a short search from the other, or dropped a listing on a
 * duplicate would still produce a full looking page of real postings, and
 * nothing on screen would say the set had been selected. The build proved it
 * with a throwaway script that was deleted, so until now the rule was held up
 * by its own doc comment.
 *
 * NOTHING IS MOCKED AND NOTHING NEEDS TO BE. `keepListings()` is exported and
 * pure precisely so it can be driven over plain arrays, with no session, no
 * Adzuna call and no database, which is what makes the zero case provable at
 * all.
 *
 * THE FIXTURES CARRY DISTINGUISHABLE IDS AND NOTHING ELSE OF SUBSTANCE. Every
 * assertion here is about identity, order and count, so a listing is reduced to
 * its `sourceJobId`; a fixture with realistic prose would only invite an
 * assertion about something this function does not decide.
 */

/** One listing, distinguishable by id and otherwise deliberately uniform. */
function listing(sourceJobId: string): Listing {
  return {
    source: ADZUNA_SOURCE,
    sourceJobId,
    title: `Role ${sourceJobId}`,
    companyName: `Company ${sourceJobId}`,
    location: "Somewhere",
    url: `https://example.test/${sourceJobId}`,
    descriptionSnippet: `A posting, ${sourceJobId}.`,
    salaryMin: undefined,
    salaryMax: undefined,
    salaryCurrency: undefined,
    salaryIsPredicted: false,
    postedAt: undefined,
  };
}

/** `n` listings whose ids share a prefix, so a lane's own order is readable. */
function lane(prefix: string, count: number): readonly Listing[] {
  return Array.from({ length: count }, (_unused, index) =>
    listing(`${prefix}${index + 1}`),
  );
}

/** Just the ids, in keep order, which is what every ordering assertion reads. */
function idsOf(kept: ReturnType<typeof keepListings>): readonly string[] {
  return kept.map((entry) => entry.listing.sourceJobId);
}

const [BACKEND, FRONTEND] = DEMO_SEARCHES;

describe("keepListings, the ordinary case (AC-7)", () => {
  it("alternates turns starting with the backend search", () => {
    const kept = keepListings(lane("b", 4), lane("f", 4));

    expect(idsOf(kept)).toEqual([
      "b1",
      "f1",
      "b2",
      "f2",
      "b3",
      "f3",
      "b4",
      "f4",
    ]);
  });

  it("keeps at most KEPT_LISTING_COUNT per search, not in total", () => {
    const kept = keepListings(lane("b", 20), lane("f", 20));

    expect(kept).toHaveLength(KEPT_LISTING_COUNT * 2);
    expect(
      kept.filter((entry) => entry.searchTitle === BACKEND.title),
    ).toHaveLength(KEPT_LISTING_COUNT);
    expect(
      kept.filter((entry) => entry.searchTitle === FRONTEND.title),
    ).toHaveLength(KEPT_LISTING_COUNT);
  });

  it("records which search kept each listing, never the other one", () => {
    const kept = keepListings(lane("b", 4), lane("f", 4));

    for (const entry of kept) {
      const prefix = entry.listing.sourceJobId.slice(0, 1);

      expect(entry.searchTitle).toBe(
        prefix === "b" ? BACKEND.title : FRONTEND.title,
      );
    }
  });

  it("numbers sortOrder 1 upward with no gap and no repeat", () => {
    const kept = keepListings(lane("b", 4), lane("f", 4));

    expect(kept.map((entry) => entry.sortOrder)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it("preserves each search's own arrival order within its own lane", () => {
    const kept = keepListings(lane("b", 4), lane("f", 4));

    const backendOrder = kept
      .filter((entry) => entry.searchTitle === BACKEND.title)
      .map((entry) => entry.listing.sourceJobId);

    expect(backendOrder).toEqual(["b1", "b2", "b3", "b4"]);
  });
});

describe("keepListings, the zero case", () => {
  /**
   * THE CASE THE REFRESH ABORTS ON, so it has to be reachable and finite. A
   * walk written with a `while` loop over two lanes is exactly the shape that
   * spins forever when both are empty, and the refresh's own zero check would
   * then never be reached: the route would hang rather than abort.
   */
  it("returns an empty result for two empty searches", () => {
    expect(keepListings([], [])).toEqual([]);
  });

  it("publishes the other search's listings when one returns nothing", () => {
    const kept = keepListings([], lane("f", 3));

    expect(idsOf(kept)).toEqual(["f1", "f2", "f3"]);
    expect(kept.every((entry) => entry.searchTitle === FRONTEND.title)).toBe(
      true,
    );
  });

  it("still numbers sortOrder from 1 when only one search kept anything", () => {
    const kept = keepListings(lane("b", 2), []);

    expect(kept.map((entry) => entry.sortOrder)).toEqual([1, 2]);
  });
});

describe("keepListings, a short search (AC-7)", () => {
  /**
   * THE ANTI PADDING RULE, AND IT IS THE ONE WORTH PINNING. A walk that topped
   * a short search up from the other would publish 8 listings here instead of
   * 6, and the page would look healthier than the search actually was.
   */
  it("never tops a short search up from the other one", () => {
    const kept = keepListings(lane("b", 2), lane("f", 9));

    expect(kept).toHaveLength(2 + KEPT_LISTING_COUNT);
    expect(
      kept.filter((entry) => entry.searchTitle === BACKEND.title),
    ).toHaveLength(2);
  });

  it("lets the longer search carry on alone once the short one is spent", () => {
    const kept = keepListings(lane("b", 1), lane("f", 4));

    expect(idsOf(kept)).toEqual(["b1", "f1", "f2", "f3", "f4"]);
  });
});

describe("keepListings, the scenario verify.md names (AC-7, AC-17)", () => {
  /**
   * THE EXACT FIXTURE THE SPEC'S OWN VERIFY STEP SPECIFIES, written out here
   * rather than left implied by the cases around it. `verify.md` asks for a
   * backend list of 2 and a frontend list of 6 whose first entry repeats
   * backend's first id, because a live search cannot be made to return a
   * duplicate and a short list on demand. It combines three rules that the
   * other tests in this file check one at a time, which is the combination a
   * real short run actually hits.
   */
  const backend = lane("b", 2);
  const frontend = (): readonly Listing[] => {
    const [first] = backend;

    if (first === undefined) throw new Error("Fixture lane is empty.");

    return [first, ...lane("f", 5)];
  };

  it("keeps the six listings the step names, in the order it names", () => {
    const kept = keepListings(backend, frontend());

    expect(idsOf(kept)).toEqual(["b1", "f1", "b2", "f2", "f3", "f4"]);
  });

  it("numbers them sortOrder 1 to 6", () => {
    expect(keepListings(backend, frontend()).map((e) => e.sortOrder)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it("names the search that kept each one", () => {
    expect(
      keepListings(backend, frontend()).map((entry) => entry.searchTitle),
    ).toEqual([
      BACKEND.title,
      FRONTEND.title,
      BACKEND.title,
      FRONTEND.title,
      FRONTEND.title,
      FRONTEND.title,
    ]);
  });

  /**
   * THE BREAK THE STEP ASKS FOR, STATED AS AN ASSERTION RATHER THAN LEFT TO A
   * MANUAL EDIT. Letting frontend borrow backend's unused share would keep a
   * seventh listing, since frontend still holds one unkept result. Pinning the
   * count at six is what fails if the cap ever moves from per lane to the
   * total.
   */
  it("keeps six and not a seventh, which is what borrowing would produce", () => {
    const kept = keepListings(backend, frontend());

    expect(kept).toHaveLength(6);
    expect(
      kept.filter((entry) => entry.searchTitle === FRONTEND.title),
    ).toHaveLength(4);
  });
});

describe("keepListings, a listing both searches returned", () => {
  /**
   * THE TIE RULE, FIXED BEFORE ANY SCORE EXISTS. Backend moves first, so at
   * equal rank it reaches the shared listing first and keeps it.
   */
  it("keeps a shared listing once, under the search that reached it first", () => {
    const shared = listing("shared");
    const kept = keepListings(
      [shared, ...lane("b", 1)],
      [shared, ...lane("f", 1)],
    );

    const sharedEntries = kept.filter(
      (entry) => entry.listing.sourceJobId === "shared",
    );

    expect(sharedEntries).toHaveLength(1);
    expect(sharedEntries[0]?.searchTitle).toBe(BACKEND.title);
  });

  /**
   * A DUPLICATE COSTS THE SECOND SEARCH NOTHING, which is the half a naive
   * "skip it" would get wrong: skipping the turn entirely would leave frontend
   * with three listings here while its results held four usable ones.
   */
  it("costs the second search no turn, so it still keeps its full count", () => {
    const backend = lane("b", 4);
    const shared = backend[0];

    if (shared === undefined) throw new Error("Fixture lane is empty.");

    const kept = keepListings(backend, [shared, ...lane("f", 4)]);

    expect(
      kept.filter((entry) => entry.searchTitle === FRONTEND.title),
    ).toHaveLength(KEPT_LISTING_COUNT);
    expect(idsOf(kept)).toEqual([
      "b1",
      "f1",
      "b2",
      "f2",
      "b3",
      "f3",
      "b4",
      "f4",
    ]);
  });

  it("leaves no gap in sortOrder where a duplicate was dropped", () => {
    const shared = listing("shared");
    const kept = keepListings(
      [shared, ...lane("b", 2)],
      [shared, ...lane("f", 2)],
    );

    /**
     * FIVE, NOT SIX. The shared listing is kept once, so the walk publishes one
     * fewer than the six ids the two lanes name between them. The point of the
     * assertion is that the numbering closes up rather than leaving a hole
     * where the duplicate would have sat.
     */
    expect(kept).toHaveLength(5);
    expect(kept.map((entry) => entry.sortOrder)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps a single shared listing exactly once when it is all there is", () => {
    const shared = listing("shared");
    const kept = keepListings([shared], [shared]);

    expect(idsOf(kept)).toEqual(["shared"]);
  });
});

describe("keepListings, what it must never do", () => {
  /**
   * NOTHING IS SELECTED OR REORDERED BY OUTCOME, and the fixtures here cannot
   * carry an outcome at all: `keepListings()` is handed listings, never scores.
   * What this pins is the weaker, checkable half of that claim, that the kept
   * set is a prefix of each lane's own arrival order rather than any rearranged
   * subset of it.
   */
  it("keeps a prefix of each search's own results, never a later pick", () => {
    const backend = lane("b", 10);
    const kept = keepListings(backend, lane("f", 10));

    const backendKept = kept
      .filter((entry) => entry.searchTitle === BACKEND.title)
      .map((entry) => entry.listing.sourceJobId);

    expect(backendKept).toEqual(
      backend.slice(0, KEPT_LISTING_COUNT).map((item) => item.sourceJobId),
    );
  });

  it("returns the listing objects themselves, not rebuilt copies", () => {
    const backend = lane("b", 1);
    const kept = keepListings(backend, []);

    expect(kept[0]?.listing).toBe(backend[0]);
  });

  it("mutates neither input array", () => {
    const backend = lane("b", 6);
    const frontend = lane("f", 6);

    keepListings(backend, frontend);

    expect(backend.map((item) => item.sourceJobId)).toEqual([
      "b1",
      "b2",
      "b3",
      "b4",
      "b5",
      "b6",
    ]);
    expect(frontend.map((item) => item.sourceJobId)).toEqual([
      "f1",
      "f2",
      "f3",
      "f4",
      "f5",
      "f6",
    ]);
  });
});

describe("keepListings, duplicates under the shared dedup key (spec 0022, AC-8)", () => {
  /**
   * `/demo` and `/search` must agree on what a duplicate is (invariant 5), so
   * this walk is driven over the same Everpure pair `/search`'s own dedup test
   * uses, plus a synthetic true duplicate. Before spec 0022 the walk compared
   * `sourceJobId` alone, and the second case below kept both ids.
   */
  const asListing = (fields: DedupFields): Listing => ({
    ...listing(fields.sourceJobId),
    companyName: fields.companyName,
    title: fields.title,
    location: fields.location,
  });

  it("keeps both Everpure roles, because their titles differ", () => {
    const [manager, engineer] = EVERPURE_PAIR.map(asListing);
    if (manager === undefined || engineer === undefined)
      throw new Error("fixture");

    expect(idsOf(keepListings([manager, engineer], []))).toEqual([
      "5883839578",
      "5883870504",
    ]);
  });

  it("keeps one of two ids sharing company, title and location, across the two searches", () => {
    const shared = {
      companyName: "Acme",
      title: "Engineer",
      location: "Boston",
    };
    const backend = [{ ...listing("b1"), ...shared }];
    const frontend = [{ ...listing("f1"), ...shared }, listing("f2")];

    // The frontend duplicate costs that search nothing: it keeps f2 instead.
    expect(idsOf(keepListings(backend, frontend))).toEqual(["b1", "f2"]);
  });

  it("still recognises one location-less listing returned by both searches", () => {
    const shared = { ...listing("x"), location: undefined };

    expect(
      idsOf(keepListings([shared], [{ ...shared }, listing("f2")])),
    ).toEqual(["x", "f2"]);
  });

  it("keeps two different location-less ids at one company and title apart", () => {
    const blank = {
      companyName: "Acme",
      title: "Engineer",
      location: undefined,
    };

    expect(
      idsOf(
        keepListings(
          [{ ...listing("b1"), ...blank }],
          [{ ...listing("f1"), ...blank }],
        ),
      ),
    ).toEqual(["b1", "f1"]);
  });
});
