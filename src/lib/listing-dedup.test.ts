import { describe, expect, it } from "vitest";

import { EVERPURE_PAIR } from "../../test/fixtures/everpure-pair";

import {
  dedupeListings,
  listingDedupKey,
  type DedupFields,
} from "./listing-dedup";

/**
 * The dedup key and grouping (spec 0022, AC-1, AC-2, AC-3).
 *
 * THE TEST THE SCOPE ROW ASKS FOR is the Everpure case: a key that would hide a
 * real result has to fail it. The rest pin the other half, that a genuine
 * duplicate does collapse, since a key that never merged anything would pass
 * the Everpure case too.
 */

function listing(
  sourceJobId: string,
  fields: Partial<Omit<DedupFields, "sourceJobId">> = {},
): DedupFields {
  return {
    source: "adzuna",
    sourceJobId,
    companyName: "Acme Corp",
    title: "Backend Engineer",
    location: "Boston, MA",
    ...fields,
  };
}

const ids = (listings: readonly DedupFields[]) =>
  listings.map((entry) => entry.sourceJobId);

describe("two distinct roles at one company stay two results (AC-2)", () => {
  it("keeps the real Everpure pair as two results", () => {
    expect(ids(dedupeListings(EVERPURE_PAIR, undefined))).toEqual([
      "5883839578",
      "5883870504",
    ]);
  });

  it("gives the Everpure pair two different keys", () => {
    const [manager, engineer] = EVERPURE_PAIR;
    expect(listingDedupKey(manager)).not.toBe(listingDedupKey(engineer));
  });
});

describe("a genuine duplicate collapses (AC-1)", () => {
  it("collapses two ids with equal company, title and location", () => {
    expect(
      ids(dedupeListings([listing("a"), listing("b")], undefined)),
    ).toEqual(["a"]);
  });

  it("normalises case, edge whitespace and internal runs before comparing", () => {
    const shouted = listing("b", {
      companyName: "  ACME   corp ",
      title: "backend\tENGINEER",
      location: "boston,  ma",
    });
    expect(ids(dedupeListings([listing("a"), shouted], undefined))).toEqual([
      "a",
    ]);
  });

  it("keeps the group at its first position, among other results", () => {
    const result = dedupeListings(
      [
        listing("a"),
        listing("x", { title: "Frontend Engineer" }),
        listing("b"),
        listing("y", { companyName: "Other" }),
      ],
      undefined,
    );
    expect(ids(result)).toEqual(["a", "x", "y"]);
  });

  it("does not collapse on a different location", () => {
    expect(
      ids(
        dedupeListings(
          [listing("a"), listing("b", { location: "Remote" })],
          undefined,
        ),
      ),
    ).toEqual(["a", "b"]);
  });
});

describe("a blank location never counts as agreement (AC-1, invariant 2)", () => {
  it("keeps two different listings apart when both lack a location", () => {
    const result = dedupeListings(
      [
        listing("a", { location: undefined }),
        listing("b", { location: undefined }),
      ],
      undefined,
    );
    expect(ids(result)).toEqual(["a", "b"]);
  });

  it("treats an empty or whitespace only location as absent", () => {
    const result = dedupeListings(
      [listing("a", { location: "" }), listing("b", { location: "   " })],
      undefined,
    );
    expect(ids(result)).toEqual(["a", "b"]);
  });

  it("gives the same listing the same key on every call, so /demo still sees it twice as once", () => {
    const first = listing("a", { location: undefined });
    const again = listing("a", { location: undefined });
    expect(listingDedupKey(first)).toBe(listingDedupKey(again));
  });

  it("never lets a located key match an unlocated one", () => {
    expect(listingDedupKey(listing("a", { location: undefined }))).not.toBe(
      listingDedupKey(listing("b")),
    );
  });
});

describe("the kept id is the one the caller applied to (AC-3)", () => {
  it("keeps the second id of two when that is the applied one", () => {
    const result = dedupeListings([listing("a"), listing("b")], new Set(["b"]));
    expect(ids(result)).toEqual(["b"]);
  });

  it("keeps the earlier applied id when two of three carry an application", () => {
    const result = dedupeListings(
      [listing("a"), listing("b"), listing("c")],
      new Set(["c", "b"]),
    );
    expect(ids(result)).toEqual(["b"]);
  });

  it("falls back to the first occurrence when the applied read failed", () => {
    const result = dedupeListings([listing("a"), listing("b")], undefined);
    expect(ids(result)).toEqual(["a"]);
  });

  it("falls back to the first occurrence when no id in the group was applied to", () => {
    const result = dedupeListings(
      [listing("a"), listing("b")],
      new Set(["unrelated"]),
    );
    expect(ids(result)).toEqual(["a"]);
  });
});

describe("dedup never empties a list", () => {
  it("returns an empty list for an empty list and one item for one", () => {
    expect(dedupeListings([], undefined)).toEqual([]);
    expect(ids(dedupeListings([listing("a")], undefined))).toEqual(["a"]);
  });
});
