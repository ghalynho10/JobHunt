import { describe, expect, it } from "vitest";

import type { Listing } from "@/features/search/adzuna";

import {
  validateGroundTruth,
  type EvalArchetype,
  type GroundTruthIssue,
  type GroundTruthPair,
} from "./ground-truth";

/**
 * The ground truth set's guard test (spec 0016, AC-8).
 *
 * IT PROVES THE VALIDATOR AND THE DATA SEPARATELY, and that split is the point.
 * Asserting only that the committed set comes back clean would pass just as
 * happily against a validator that had silently stopped checking something, so
 * every check below is also driven with a fixture deliberately broken in exactly
 * that one way. A check that stopped firing fails here even while the real data
 * still looks fine.
 *
 * THE FIXTURES ARE INLINE AND MINIMAL, never derived from `ARCHETYPES` or
 * `PAIRS`. A fixture built by mutating the real set would go green or red for
 * reasons that had nothing to do with the check under test the next time a pair
 * was added.
 */

/** One posting for a fixture. Only the four scored fields ever vary here. */
function fixtureListing(descriptionSnippet: string | undefined): Listing {
  return {
    source: "adzuna",
    sourceJobId: "fixture-1",
    title: "Backend Engineer",
    companyName: "Fixture Works",
    location: "Remote",
    url: "https://www.adzuna.com/land/ad/fixture-1",
    descriptionSnippet,
    salaryMin: undefined,
    salaryMax: undefined,
    salaryCurrency: undefined,
    salaryIsPredicted: false,
    postedAt: undefined,
  };
}

const fixtureArchetype: EvalArchetype = {
  id: "alpha",
  label: "Alpha",
  description: "A fixture archetype. Never scored against anything.",
  profile: {
    summary: "Fixture summary.",
    skills: ["Python"],
    experience: [],
    preferences: undefined,
  },
};

/** A fixture pair carrying only what a given check needs to look at. */
function fixturePair(overrides: Partial<GroundTruthPair>): GroundTruthPair {
  return {
    id: "pair",
    archetypeId: "alpha",
    listing: fixtureListing("A short posting."),
    expectedBand: "strong_match",
    tags: ["control"],
    rationale: "Fixture rationale.",
    ...overrides,
  };
}

/**
 * A fixture set with nothing wrong with it: all five bands covered, both
 * required tags present, every id unique, every `archetypeId` resolvable.
 *
 * EVERY NEGATIVE CASE BELOW BREAKS EXACTLY ONE THING IN THIS SET, so an issue
 * that comes back can only have come from the check under test. Without a
 * passing baseline, a negative test proves the validator returned something,
 * not that it returned the right thing for the right reason.
 */
const validPairs: readonly GroundTruthPair[] = [
  fixturePair({ id: "strong", expectedBand: "strong_match" }),
  fixturePair({ id: "good", expectedBand: "good_match" }),
  fixturePair({
    id: "possible",
    expectedBand: "possible_match",
    tags: ["preference-isolation"],
  }),
  fixturePair({ id: "weak", expectedBand: "weak_match" }),
  fixturePair({
    id: "none",
    expectedBand: "not_a_match",
    tags: ["stability-probe"],
    listing: fixtureListing("A posting cut off mid sentence and ending in…"),
  }),
];

/** Every `kind` the returned issues carry, for a compact assertion. */
function kinds(issues: readonly GroundTruthIssue[]): readonly string[] {
  return issues.map((issue) => issue.kind);
}

describe("validateGroundTruth", () => {
  it("returns no issues for a set with nothing wrong with it", () => {
    expect(validateGroundTruth([fixtureArchetype], validPairs)).toEqual([]);
  });

  it("catches two archetypes sharing one id", () => {
    const issues = validateGroundTruth(
      [fixtureArchetype, { ...fixtureArchetype, label: "Alpha again" }],
      validPairs,
    );

    expect(kinds(issues)).toEqual(["duplicate-id"]);
    expect(issues[0]?.subject).toBe("alpha");
  });

  it("catches two pairs sharing one id", () => {
    const issues = validateGroundTruth(
      [fixtureArchetype],
      [
        ...validPairs,
        fixturePair({ id: "strong", expectedBand: "good_match" }),
      ],
    );

    expect(kinds(issues)).toEqual(["duplicate-id"]);
    expect(issues[0]?.subject).toBe("strong");
  });

  it("catches a pair naming an archetype that does not exist", () => {
    const issues = validateGroundTruth(
      [fixtureArchetype],
      validPairs.map((pair) =>
        pair.id === "good" ? { ...pair, archetypeId: "omega" } : pair,
      ),
    );

    expect(kinds(issues)).toEqual(["unknown-archetype-id"]);
    expect(issues[0]?.subject).toBe("good");
    expect(issues[0]?.message).toContain("omega");
  });

  it("catches a band no pair expects or accepts", () => {
    const issues = validateGroundTruth(
      [fixtureArchetype],
      validPairs.filter((pair) => pair.expectedBand !== "weak_match"),
    );

    expect(kinds(issues)).toEqual(["band-not-covered"]);
    expect(issues[0]?.subject).toBe("weak_match");
  });

  /**
   * 501 characters, one over Adzuna's own ceiling. The boundary is asserted
   * from the other side too, below: a check written with `>=` would pass this
   * test and wrongly reject every posting authored right up to the real limit.
   */
  it("catches a descriptionSnippet longer than Adzuna would ever return", () => {
    const issues = validateGroundTruth(
      [fixtureArchetype],
      validPairs.map((pair) =>
        pair.id === "good"
          ? { ...pair, listing: fixtureListing("x".repeat(501)) }
          : pair,
      ),
    );

    expect(kinds(issues)).toEqual(["snippet-too-long"]);
    expect(issues[0]?.subject).toBe("good");
  });

  it("accepts a descriptionSnippet exactly at the 500 character ceiling", () => {
    const issues = validateGroundTruth(
      [fixtureArchetype],
      validPairs.map((pair) =>
        pair.id === "good"
          ? { ...pair, listing: fixtureListing("x".repeat(500)) }
          : pair,
      ),
    );

    expect(issues).toEqual([]);
  });

  it("catches acceptableBands that omit their own expectedBand", () => {
    const issues = validateGroundTruth(
      [fixtureArchetype],
      validPairs.map((pair) =>
        pair.id === "good"
          ? {
              ...pair,
              acceptableBands: ["possible_match", "weak_match"] as const,
            }
          : pair,
      ),
    );

    expect(kinds(issues)).toEqual(["invalid-acceptable-bands"]);
    expect(issues[0]?.message).toContain("good_match");
  });

  it("catches a one element acceptableBands standing in for an exact expectation", () => {
    const issues = validateGroundTruth(
      [fixtureArchetype],
      validPairs.map((pair) =>
        pair.id === "good"
          ? { ...pair, acceptableBands: ["good_match"] as const }
          : pair,
      ),
    );

    expect(kinds(issues)).toEqual(["invalid-acceptable-bands"]);
    expect(issues[0]?.subject).toBe("good");
  });

  it.each(["preference-isolation", "stability-probe"])(
    "catches a set with no %s tagged pair",
    (tag) => {
      const issues = validateGroundTruth(
        [fixtureArchetype],
        validPairs.map((pair) =>
          pair.tags.includes(tag) ? { ...pair, tags: ["control"] } : pair,
        ),
      );

      expect(kinds(issues)).toContain("missing-required-tag");
      expect(
        issues.find((issue) => issue.kind === "missing-required-tag")?.subject,
      ).toBe(tag);
    },
  );

  /**
   * THE POINT OF THIS CASE IS THAT `...` LOOKS RIGHT AND IS NOT. Three ASCII
   * periods read as a truncated posting to a person, but `buildScoringPrompt()`
   * tests for U+2026 alone, so this snippet would be described to the model as
   * a whole posting and the probe would stop probing the shape it exists for.
   */
  it("catches a stability probe pair ending in three periods rather than U+2026", () => {
    const issues = validateGroundTruth(
      [fixtureArchetype],
      validPairs.map((pair) =>
        pair.tags.includes("stability-probe")
          ? {
              ...pair,
              listing: fixtureListing("A posting cut off mid sentence and..."),
            }
          : pair,
      ),
    );

    expect(kinds(issues)).toEqual(["stability-probe-not-truncated"]);
    expect(issues[0]?.subject).toBe("none");
  });

  it("catches a stability probe pair with no description at all", () => {
    const issues = validateGroundTruth(
      [fixtureArchetype],
      validPairs.map((pair) =>
        pair.tags.includes("stability-probe")
          ? { ...pair, listing: fixtureListing(undefined) }
          : pair,
      ),
    );

    expect(kinds(issues)).toEqual(["stability-probe-not-truncated"]);
  });
});
