import { describe, expect, it } from "vitest";

import type { Listing } from "@/features/search/adzuna";

import { buildScoringPrompt } from "../rubric";
import { ARCHETYPES } from "./archetypes";
import type { GroundTruthPair } from "./ground-truth";
import { PAIRS } from "./pairs";

/**
 * What the committed ground truth pairs actually render to, through the real
 * `buildScoringPrompt()` (spec 0016, AC-4 and AC-5).
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `ground-truth.test.ts`. That file proves
 * the data and the validator: ids, bands, tags, snippet lengths, the wording of
 * the fixtures. None of it calls the consumer. Every claim spec 0016 makes about
 * what these pairs put in front of the model, that two isolation postings differ
 * on one line, that the stability probe reaches the cut off branch, that a pay
 * figure can only travel as prose, was proved by hand during `/check verify` on
 * 2026-09-07 and locked by nothing afterwards. A change to `buildScoringPrompt()`
 * could quietly invalidate all of it while every data test stayed green.
 *
 * IT ASSERTS ON RENDERED PROMPTS, NEVER ON FIXTURE TEXT. The fixture wording is
 * already covered next door, and repeating it here would only give the same
 * claim two places to drift from. Everything below reads the string the model
 * would actually receive.
 *
 * IT DRIVES THE REAL COMMITTED DATA, not a fixture. `buildScoringPrompt()` is
 * pure over two values and calls no vendor, so the real archetypes and the real
 * pairs can go through it directly with nothing mocked.
 */

/** The pair with this id, or a failure naming it rather than an undefined read. */
function pairById(id: string): GroundTruthPair {
  const pair = PAIRS.find((candidate) => candidate.id === id);

  if (pair === undefined)
    throw new Error(`No ground truth pair named "${id}".`);

  return pair;
}

/** What the model is actually sent for one pair: its archetype's profile and its posting. */
function renderPrompt(id: string): string {
  const pair = pairById(id);
  const archetype = ARCHETYPES.find(
    (candidate) => candidate.id === pair.archetypeId,
  );

  if (archetype === undefined) {
    throw new Error(
      `Pair "${id}" names archetype "${pair.archetypeId}", which does not exist.`,
    );
  }

  return buildScoringPrompt(archetype.profile, pair.listing);
}

/** Every line index where two rendered prompts disagree. */
function differingLines(
  left: string,
  right: string,
): readonly {
  readonly index: number;
  readonly left: string | undefined;
  readonly right: string | undefined;
}[] {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const differences: {
    index: number;
    left: string | undefined;
    right: string | undefined;
  }[] = [];

  for (
    let index = 0;
    index < Math.max(leftLines.length, rightLines.length);
    index += 1
  ) {
    if (leftLines[index] !== rightLines[index]) {
      differences.push({
        index,
        left: leftLines[index],
        right: rightLines[index],
      });
    }
  }

  return differences;
}

describe("the preference isolation pairs, rendered (AC-4)", () => {
  /**
   * covers: AC-4. The title pair is the strongest evidence in the set, and only
   * because the rendered difference is this narrow: one line. If a run scores it
   * below its baseline, nothing else about the posting changed to explain it.
   */
  it("renders preference-match and preference-title-conflict differing on the Title line alone", () => {
    const differences = differingLines(
      renderPrompt("preference-match"),
      renderPrompt("preference-title-conflict"),
    );

    expect(differences.length, "exactly one line differs").toBe(1);
    expect(differences[0]?.left).toBe("Title: Backend Engineer");
    expect(differences[0]?.right).toBe("Title: Server Side Engineer");
  });

  /**
   * covers: AC-4. The circumstance pair varies three preferences at once, so its
   * rendered difference is two lines: the structured `Location:` field, and the
   * description whose tail carries the on site language and the pay figure. The
   * requirements half of that description must still match exactly, or a band
   * that moves has an innocent explanation.
   */
  it("renders preference-match and preference-violation differing only in Location and the circumstance sentences", () => {
    const differences = differingLines(
      renderPrompt("preference-match"),
      renderPrompt("preference-violation"),
    );

    expect(differences.length, "exactly two lines differ").toBe(2);

    const [locationLine, descriptionLine] = differences;

    expect(locationLine?.left).toBe("Location: Remote");
    expect(locationLine?.right).toBe("Location: Chicago, IL");

    /**
     * The description renders as one line, so its requirements half and its
     * circumstances half are compared inside it. `This role is` is where every
     * isolation posting turns from requirements to circumstances.
     */
    const requirements = (line: string | undefined): string =>
      (line ?? "").split(" This role is")[0] ?? "";

    expect(requirements(descriptionLine?.left)).toBe(
      requirements(descriptionLine?.right),
    );
    expect(requirements(descriptionLine?.left)).not.toBe("");
    expect(descriptionLine?.left).toContain("fully remote");
    expect(descriptionLine?.right).toContain("no remote option");
  });

  /**
   * covers: AC-4. All three isolation pairs carry the same expected band, so the
   * candidate half of every prompt has to be identical too. A difference here
   * would mean they had drifted onto different archetypes.
   */
  it("renders the same candidate section for all three isolation pairs", () => {
    const candidateSections = PAIRS.filter((pair) =>
      pair.tags.includes("preference-isolation"),
    ).map((pair) => renderPrompt(pair.id).split("# The posting")[0]);

    expect(candidateSections.length).toBe(3);
    expect(
      new Set(candidateSections).size,
      "one shared candidate section",
    ).toBe(1);
  });
});

describe("the stability probe, rendered (AC-5)", () => {
  /**
   * covers: AC-5. The probe only probes the shape spec 0015 observed scoring
   * inconsistently if the prompt tells the model the text was cut off. The two
   * headers are mutually exclusive branches of `buildScoringPrompt()`, so both
   * are asserted: the wrong one being absent is the half that would silently
   * change if the truncation check moved.
   */
  it("routes stability-probe-generic into the cut off branch", () => {
    const prompt = renderPrompt("stability-probe-generic");

    expect(prompt).toContain(
      "Description (CUT OFF: this is the first 500 characters of a longer description, and the rest was not returned):",
    );
    expect(prompt).not.toContain(
      "Description (short enough that Adzuna returned all of it)",
    );
  });
});

describe("salary never reaches the model (AC-4)", () => {
  /**
   * covers: AC-4. THE PROBE SALARY IS THE WHOLE POINT OF THIS TEST. Every
   * committed pair sets `salaryMin` and `salaryMax` to `undefined`, so asserting
   * that a rendered prompt omits "its listing's salary" would be vacuously true
   * and would pass just as happily against a `buildScoringPrompt()` that had
   * started sending salary. Giving each listing a distinctive figure first makes
   * the claim falsifiable: if the function ever renders the field, these digits
   * appear.
   *
   * AC-4 RESTS ON THIS. The preference violation pair's pay conflict has to be
   * readable by the model, and the only route left is the description prose. If
   * salary became a structured field in the prompt, that pair would start
   * conflicting on pay twice, and the description text would no longer be the
   * thing under test.
   */
  const PROBE_SALARY_MIN = 191_919;
  const PROBE_SALARY_MAX = 828_282;

  it.each(PAIRS.map((pair) => pair.id))(
    "omits an injected salary from %s's rendered prompt",
    (id) => {
      const pair = pairById(id);
      const archetype = ARCHETYPES.find(
        (candidate) => candidate.id === pair.archetypeId,
      );

      if (archetype === undefined) throw new Error(`No archetype for "${id}".`);

      const withSalary: Listing = {
        ...pair.listing,
        salaryMin: PROBE_SALARY_MIN,
        salaryMax: PROBE_SALARY_MAX,
        salaryCurrency: "USD",
      };

      const prompt = buildScoringPrompt(archetype.profile, withSalary);

      expect(prompt).not.toContain(String(PROBE_SALARY_MIN));
      expect(prompt).not.toContain(String(PROBE_SALARY_MAX));
    },
  );

  /**
   * covers: AC-4. The committed pairs leave the salary fields unset, which is
   * what `pairs.ts` documents. This is the cheap guard that the probe above is
   * testing an injected value rather than one the fixtures had all along.
   */
  it("leaves salaryMin and salaryMax unset on every committed pair", () => {
    for (const pair of PAIRS) {
      expect(
        pair.listing.salaryMin,
        `${pair.id} sets no salaryMin`,
      ).toBeUndefined();
      expect(
        pair.listing.salaryMax,
        `${pair.id} sets no salaryMax`,
      ).toBeUndefined();
    }
  });
});
