import { describe, expect, it } from "vitest";

import type { Listing } from "@/features/search/adzuna";
import { ADZUNA_SNIPPET_CHARACTERS, BANDS } from "../rubric";

import { ARCHETYPES } from "./archetypes";
import {
  validateGroundTruth,
  type EvalArchetype,
  type GroundTruthIssue,
  type GroundTruthPair,
} from "./ground-truth";
import { PAIRS } from "./pairs";

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

/**
 * The committed set itself (AC-1, AC-2, AC-8).
 *
 * THIS BLOCK IS THE WEAKER HALF ON PURPOSE, and it only means anything because
 * the block above proves the checks fire. On its own, "the real data returns no
 * issues" would pass against a validator that had quietly stopped checking
 * anything at all.
 *
 * WHAT IT ADDS THAT THE VALIDATOR CANNOT. `validateGroundTruth()` checks
 * invariants a harness run depends on; the counts and the AC-1 privacy rule
 * below are authoring commitments no pure function can read off the data. An
 * edit that dropped an archetype or narrowed the set would leave every
 * invariant intact and still break what the spec promised.
 */
describe("the committed ground truth set", () => {
  it("has no issues", () => {
    expect(validateGroundTruth(ARCHETYPES, PAIRS)).toEqual([]);
  });

  it("holds at least the four archetypes and fifteen pairs AC-1 and AC-2 sized", () => {
    expect(ARCHETYPES.length).toBeGreaterThanOrEqual(4);
    expect(PAIRS.length).toBeGreaterThanOrEqual(15);
  });

  /**
   * Spec 0015's AC-7 gate. An archetype with neither a skill nor a work history
   * entry is refused before scoring, so it could never produce a usable pair
   * and would sit in the set looking fine.
   */
  it("gives every archetype at least one skill or one work history entry", () => {
    for (const archetype of ARCHETYPES) {
      expect(
        archetype.profile.skills.length + archetype.profile.experience.length,
        `${archetype.id} clears spec 0015's AC-7 scoring gate`,
      ).toBeGreaterThan(0);
    }
  });

  /**
   * AC-2's stronger half, which `validateGroundTruth()`'s coverage check
   * deliberately does not assert: every band must be reachable by at least one
   * pair whose expectation is exact. A set where a band existed only inside
   * some other pair's widened tolerance would pass the validator while never
   * measuring that band against a confident answer.
   */
  it("covers every band with at least one exact expectation", () => {
    const exact = new Set(PAIRS.map((pair) => pair.expectedBand));

    for (const band of BANDS) {
      expect(exact, `${band} has a pair that expects it exactly`).toContain(
        band,
      );
    }
  });

  /**
   * AC-4's own structure, which no invariant in the validator can see. The two
   * isolation pairs are only evidence if their skill and experience wording is
   * genuinely identical: if the requirements differ at all, a band that moves
   * between them has an innocent explanation and proves nothing about
   * preferences leaking.
   */
  it("states identical requirements across the two preference isolation pairs", () => {
    const isolation = PAIRS.filter((pair) =>
      pair.tags.includes("preference-isolation"),
    );

    expect(isolation.length).toBe(2);

    const [baseline, violation] = isolation;
    const requirements = (pair: GroundTruthPair | undefined): string =>
      pair?.listing.descriptionSnippet?.split(
        "Two to four years of professional backend experience.",
      )[0] ?? "";

    expect(requirements(baseline)).toBe(requirements(violation));
    expect(requirements(baseline)).not.toBe("");

    /** Both must expect the same band, or the pair asserts nothing. */
    expect(baseline?.expectedBand).toBe(violation?.expectedBand);

    /** And the postings must really differ, or nothing is being isolated. */
    expect(baseline?.listing.descriptionSnippet).not.toBe(
      violation?.listing.descriptionSnippet,
    );
    expect(baseline?.listing.location).not.toBe(violation?.listing.location);
  });

  /**
   * AC-5's length half. The ellipsis alone is checked by the validator; the
   * near full length is what makes `buildScoringPrompt()`'s own claim to the
   * model, "this is the first 500 characters of a longer description", true of
   * this fixture rather than a short snippet wearing a decorative ellipsis.
   */
  it("writes the stability probe close to the Adzuna length ceiling", () => {
    const probes = PAIRS.filter((pair) =>
      pair.tags.includes("stability-probe"),
    );

    expect(probes.length).toBeGreaterThan(0);

    for (const probe of probes) {
      const length = probe.listing.descriptionSnippet?.length ?? 0;

      expect(
        length,
        `${probe.id} is authored near the ${ADZUNA_SNIPPET_CHARACTERS} character ceiling`,
      ).toBeGreaterThan(ADZUNA_SNIPPET_CHARACTERS - 50);
      expect(length).toBeLessThanOrEqual(ADZUNA_SNIPPET_CHARACTERS);
    }
  });

  /**
   * AC-5's other half: a probe whose text named a concrete requirement would
   * stop being a probe of the "no requirement stated" shape spec 0015 observed
   * scoring inconsistently, and would quietly become an ordinary accuracy pair.
   */
  it("names no concrete requirement anywhere in the stability probe", () => {
    const concrete =
      /\b(python|java|typescript|react|sql|aws|kubernetes|docker|postgres|airflow|years|experience required|degree|certification)\b/i;

    for (const probe of PAIRS.filter((pair) =>
      pair.tags.includes("stability-probe"),
    )) {
      expect(
        probe.listing.descriptionSnippet ?? "",
        `${probe.id} states no concrete skill, technology or seniority requirement`,
      ).not.toMatch(concrete);
    }
  });

  /**
   * AC-1's privacy rule, as far as a test can reach it. It cannot prove text is
   * invented, but it can prove the one real name that would most plausibly slip
   * in is absent: this repository's own author, whose real profile is the thing
   * every archetype was written to avoid being. Everything here reaches OpenAI
   * on every harness run, from a public repository.
   */
  it("carries no real employer or person this project could have leaked", () => {
    const authored = JSON.stringify(ARCHETYPES).toLowerCase();

    for (const name of [
      "ghaly",
      "jobhunt",
      "adzuna",
      "supabase",
      "anthropic",
    ]) {
      expect(
        authored,
        `no real name "${name}" reached an archetype`,
      ).not.toContain(name);
    }
  });
});
