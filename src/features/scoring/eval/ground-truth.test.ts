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

  /**
   * THE SAME BAND TWICE IS THE ONE ELEMENT CASE IN DISGUISE, and it slipped
   * past an earlier length based check: two entries, and it contains its own
   * `expectedBand`, so nothing fired while the pair named one real band. Raised
   * by a fresh model review on 2026-09-07.
   */
  it("catches an acceptableBands naming the same band twice", () => {
    const issues = validateGroundTruth(
      [fixtureArchetype],
      validPairs.map((pair) =>
        pair.id === "good"
          ? { ...pair, acceptableBands: ["good_match", "good_match"] as const }
          : pair,
      ),
    );

    expect(kinds(issues)).toEqual(["invalid-acceptable-bands"]);
    expect(issues[0]?.subject).toBe("good");
    expect(issues[0]?.message).toContain("1 distinct band");
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

  it("holds at least the four archetypes and sixteen pairs AC-1 and AC-2 sized", () => {
    expect(ARCHETYPES.length).toBeGreaterThanOrEqual(4);
    expect(PAIRS.length).toBeGreaterThanOrEqual(16);
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
   * AC-4's own structure, which no invariant in the validator can see.
   *
   * THE PAIRS ARE ONLY EVIDENCE IF THEIR REQUIREMENTS ARE GENUINELY IDENTICAL.
   * If the skill and experience wording differs at all, a band that moves
   * between them has an innocent explanation and proves nothing about a
   * preference leaking. `pairs.ts` shares one `BASELINE_REQUIREMENTS` constant
   * to make drift hard; this asserts the outcome from the outside anyway,
   * because the constant could be reintroduced as three literals by a later
   * edit and nothing else would notice.
   */
  it("states identical requirements across every preference isolation pair", () => {
    const isolation = PAIRS.filter((pair) =>
      pair.tags.includes("preference-isolation"),
    );

    expect(isolation.length).toBeGreaterThanOrEqual(3);

    /**
     * SPLIT AT THE START OF THE CIRCUMSTANCES, NOT AT THE END OF THE
     * REQUIREMENTS. An earlier version of this test split on the requirements
     * sentence itself and compared only the text BEFORE it, which left every
     * word between that sentence and the circumstances unchecked: appending
     * " Kafka also useful." to one pair's requirements passed it. Splitting at
     * the circumstances marker means the whole requirements half is compared.
     */
    const CIRCUMSTANCES_MARKER = " This role is";

    const requirements = (pair: GroundTruthPair): string =>
      pair.listing.descriptionSnippet?.split(CIRCUMSTANCES_MARKER)[0] ?? "";

    for (const pair of isolation) {
      expect(
        pair.listing.descriptionSnippet ?? "",
        `${pair.id} carries the circumstances marker this test splits on`,
      ).toContain(CIRCUMSTANCES_MARKER);
    }

    const wordings = new Set(isolation.map(requirements));

    expect(
      wordings.size,
      "every isolation pair states the same requirements",
    ).toBe(1);
    expect([...wordings][0]).not.toBe("");

    /** All must expect the same band, or the comparison asserts nothing. */
    expect(new Set(isolation.map((pair) => pair.expectedBand)).size).toBe(1);

    /** All must share one archetype, or the profiles differ too. */
    expect(new Set(isolation.map((pair) => pair.archetypeId)).size).toBe(1);
  });

  /**
   * AC-4's coverage half: all four preference dimensions spec 0015's Follow up
   * names must actually be contradicted somewhere across the isolation pairs.
   *
   * THIS IS THE CHECK THAT WOULD HAVE CAUGHT THE ORIGINAL GAP. The first
   * version of this set varied location, remote and pay, and left `title`
   * matching in every pair, so nothing could have caught a title preference
   * moving a band. Counting pairs would not have noticed; reading each conflict
   * off the archetype's own `preferences` does.
   */
  it("contradicts all four preference dimensions across the isolation pairs", () => {
    const isolation = PAIRS.filter((pair) =>
      pair.tags.includes("preference-isolation"),
    );
    const archetype = ARCHETYPES.find(
      (candidate) => candidate.id === isolation[0]?.archetypeId,
    );
    const preferences = archetype?.profile.preferences;

    expect(
      preferences,
      "the isolation archetype states preferences",
    ).toBeDefined();
    if (preferences === undefined) return;

    const conflicts = {
      title: false,
      location: false,
      remote: false,
      pay: false,
    };

    for (const pair of isolation) {
      const { title, location, descriptionSnippet } = pair.listing;
      const snippet = descriptionSnippet ?? "";

      if (!preferences.desired_titles.includes(title)) conflicts.title = true;

      if (
        location !== undefined &&
        !preferences.desired_locations.includes(location)
      ) {
        conflicts.location = true;
      }

      if (
        preferences.remote_preference === "remote" &&
        /no remote option|on site/i.test(snippet)
      ) {
        conflicts.remote = true;
      }

      /** Pay is only ever readable from the text: the prompt never sends the salary fields. */
      const figures = [...snippet.matchAll(/\$([\d,]+)/g)].map((match) =>
        Number(match[1]?.replace(/,/g, "")),
      );
      if (
        preferences.minimum_pay !== undefined &&
        figures.some((figure) => figure < preferences.minimum_pay!)
      ) {
        conflicts.pay = true;
      }
    }

    expect(conflicts).toEqual({
      title: true,
      location: true,
      remote: true,
      pay: true,
    });
  });

  /**
   * AC-4's grouping decision, asserted rather than left to the prose: exactly
   * one isolation pair varies the title alone, with every circumstance
   * preference still matching. If a later edit folded the title conflict into
   * the circumstance pair, the set would still contradict all four dimensions
   * and this is the only thing that would notice.
   */
  it("isolates the title conflict in a pair whose circumstances all still match", () => {
    const isolation = PAIRS.filter((pair) =>
      pair.tags.includes("preference-isolation"),
    );
    const preferences = ARCHETYPES.find(
      (candidate) => candidate.id === isolation[0]?.archetypeId,
    )?.profile.preferences;

    if (preferences === undefined)
      throw new Error("no preferences to test against");

    const titleOnly = isolation.filter(
      (pair) =>
        !preferences.desired_titles.includes(pair.listing.title) &&
        pair.listing.location !== undefined &&
        preferences.desired_locations.includes(pair.listing.location) &&
        !/no remote option|on site/i.test(
          pair.listing.descriptionSnippet ?? "",
        ),
    );

    expect(titleOnly.length, "exactly one pair varies the title alone").toBe(1);
    expect(titleOnly[0]?.id).toBe("preference-title-conflict");
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

  /**
   * Spec 0018's correction, pinned so it cannot quietly go back (AC-1).
   *
   * THIS PAIR IS THE ONE EXPECTATION IN THE SET THAT WAS RE-ARGUED AFTER A RUN
   * DISAGREED WITH IT, which is exactly the shape that invites a silent revert:
   * the pair passes on a 3 to 2 majority today, so the next reader who sees it
   * split may be tempted to put `good_match` back rather than read the anchor
   * text again. Spec 0018 settled it from `possible_match`'s own wording and
   * changed no anchor, so a change here is a decision to re-open that, and it
   * should fail loudly and be argued in a spec rather than edited in passing.
   */
  it("states spec 0018's corrected band for control-one-gap exactly", () => {
    const pair = PAIRS.find((candidate) => candidate.id === "control-one-gap");

    expect(pair, "control-one-gap is still in the set").toBeDefined();
    expect(
      pair?.expectedBand,
      "control-one-gap expects possible_match, per spec 0018 AC-1; re-argue it in a spec before changing this",
    ).toBe("possible_match");
  });

  /**
   * Spec 0018's Key invariant, applied to every control rather than to one pair.
   *
   * `acceptableBands` WIDENS A GENUINE AMBIGUITY IN THE ANCHORS. IT IS NOT A WAY
   * TO STOP A PAIR FAILING. That distinction is what the `control` tag already
   * carries: spec 0016 explains `mild-stretch-possible-match`'s own tagging as
   * "no `acceptableBands` and the plain `control` tag rather than `boundary`",
   * because the anchor text settles it. So a control that grows a tolerance has
   * not been re-argued, it has been excused, and the two pairs that legitimately
   * carry one are tagged `boundary` and `stability-probe` instead.
   *
   * This is the general form of the check above. Pinning only `control-one-gap`
   * would leave the same escape open on every other control in the set.
   */
  it("gives no control tagged pair an acceptableBands tolerance", () => {
    const widened = PAIRS.filter(
      (pair) =>
        pair.tags.includes("control") && pair.acceptableBands !== undefined,
    ).map((pair) => pair.id);

    expect(
      widened,
      "a control pair carries acceptableBands; per spec 0018 a control is settled by the anchor text, so re-argue the band or retag the pair as boundary",
    ).toEqual([]);
  });
});
