import { describe, expect, it } from "vitest";

import type { Band } from "@/features/scoring/rubric";
import type { ScoreOutcome } from "@/features/scoring/score";
import { failure, success } from "@/lib/result";

import { PAIRS } from "@/features/scoring/eval/pairs";

import {
  classifyRerun,
  pairVerdict,
  preferenceLeakCheck,
  validatePreferenceIds,
  PREFERENCE_BASELINE_ID,
  PREFERENCE_CONFLICT_IDS,
  type PairVerdict,
  type RerunOutcome,
} from "./eval-verdict";

/**
 * Spec 0017's verdict rules, proved against constructed outcomes (AC-3, AC-4,
 * AC-5, AC-6).
 *
 * NOT ONE VENDOR CALL IN THIS FILE, deliberately. Every rule the harness has to
 * get right is a pure function taking rerun outcomes as values, so each case,
 * including the ones a real run would produce only by bad luck (three vendor
 * timeouts, a 2 and 2 split, a usage gate refusal), is driven directly here
 * under the free unit suite instead of being hoped for during a paid run.
 */

/** A scored rerun landing on `band`. */
const scored = (band: Band): RerunOutcome => ({ kind: "scored", band });

/** A vendor failure: counts against this pair's denominator, nothing else. */
const failed: RerunOutcome = { kind: "failed", detail: "vendor_timeout" };

/** A gate refusal: counted toward no denominator anywhere (AC-3). */
const refused: RerunOutcome = {
  kind: "refused",
  reason: "global_day_cap_reached",
};

/** Five reruns all landing on the same band, the ordinary healthy case. */
const fiveOf = (band: Band): readonly RerunOutcome[] =>
  Array.from({ length: 5 }, () => scored(band));

describe("classifyRerun (covers AC-3)", () => {
  it("reads a scored success off an allowed result", () => {
    const outcome: ScoreOutcome = success({
      allowed: true,
      value: {
        band: "good_match",
        matchedSkills: ["Go"],
        notMentionedSkills: [],
        reasoning: "Your Go work carries over.",
        sponsorshipSignal: "not_stated",
      },
    });

    expect(classifyRerun(outcome)).toEqual({
      kind: "scored",
      band: "good_match",
    });
  });

  it("reads a gate refusal off an allowed:false result, keeping its reason", () => {
    const outcome: ScoreOutcome = success({
      allowed: false,
      reason: "kill_switch_engaged",
    });

    expect(classifyRerun(outcome)).toEqual({
      kind: "refused",
      reason: "kill_switch_engaged",
    });
  });

  /**
   * A refusal and a failure are structurally different (spec 0015's own
   * invariant) and mean opposite things here: one is the budget working, the
   * other is the vendor breaking. This is the test that would catch them being
   * collapsed into one case.
   */
  it("reads a vendor failure off a Result failure, keeping its kind", () => {
    const outcome: ScoreOutcome = failure({
      kind: "external_service_failed",
      severity: "expected",
      message: "The scoring provider did not answer in time.",
    });

    const classified = classifyRerun(outcome);

    expect(classified.kind).toBe("failed");
    expect(classified).toMatchObject({
      detail: expect.stringContaining("external_service_failed"),
    });
  });
});

describe("pairVerdict, the success floor (covers AC-3)", () => {
  it("is inconclusive with only two successes, never a pass or a fail", () => {
    const verdict = pairVerdict({
      pairId: "control-direct-match",
      expectedBand: "strong_match",
      tags: ["control"],
      outcomes: [
        scored("strong_match"),
        scored("strong_match"),
        failed,
        failed,
        failed,
      ],
    });

    expect(verdict.status).toBe("inconclusive");
    expect(verdict.inconclusiveReason).toBe("insufficient-successes");
    /** AC-3: whatever successes did land are still reported, not discarded. */
    expect(verdict.distribution).toEqual({ strong_match: 2 });
    expect(verdict.successes).toBe(2);
  });

  /**
   * The tradeoff spec 0017 accepts out loud: two real matching answers is weak
   * but real evidence, and it is reported exactly like no evidence at all. This
   * test pins that choice so a later reader sees it was decided, not missed.
   */
  it("is inconclusive with two matching successes even though both agreed", () => {
    const verdict = pairVerdict({
      pairId: "control-direct-match",
      expectedBand: "strong_match",
      tags: ["control"],
      outcomes: [scored("strong_match"), scored("strong_match"), failed],
    });

    expect(verdict.status).toBe("inconclusive");
    expect(verdict.inconclusiveReason).toBe("insufficient-successes");
  });

  /**
   * AC-3's rule that costs the most if it is wrong: a refusal must not count
   * toward any denominator. Three successes and two refusals is a full,
   * trustworthy verdict resting on three of three, NOT a three of five that
   * looks two reruns short.
   */
  it("excludes refusals from the denominator entirely", () => {
    const verdict = pairVerdict({
      pairId: "control-one-gap",
      expectedBand: "good_match",
      tags: ["control"],
      outcomes: [
        scored("good_match"),
        scored("good_match"),
        scored("good_match"),
        refused,
        refused,
      ],
    });

    expect(verdict.status).toBe("pass");
    expect(verdict.denominator).toBe(3);
    expect(verdict.successes).toBe(3);
    expect(verdict.refusals).toBe(2);
    expect(verdict.summary).toBe("good_match, 3 of 3 succeeded, 2 refused");
  });
});

describe("pairVerdict, the majority rule (covers AC-3, AC-6)", () => {
  it("passes when a strict majority lands on the expected band", () => {
    const verdict = pairVerdict({
      pairId: "control-direct-match",
      expectedBand: "strong_match",
      tags: ["control"],
      outcomes: [
        scored("strong_match"),
        scored("strong_match"),
        scored("strong_match"),
        scored("good_match"),
        scored("good_match"),
      ],
    });

    expect(verdict.status).toBe("pass");
    expect(verdict.band).toBe("strong_match");
    /** AC-6: the split is visible even though the pair passed. */
    expect(verdict.distribution).toEqual({ strong_match: 3, good_match: 2 });
    expect(verdict.summary).toBe("strong_match, 5 of 5 succeeded");
  });

  it("fails when the majority lands on a band the pair does not accept", () => {
    const verdict = pairVerdict({
      pairId: "control-unrelated-field",
      expectedBand: "not_a_match",
      tags: ["control"],
      outcomes: fiveOf("weak_match"),
    });

    expect(verdict.status).toBe("fail");
    expect(verdict.band).toBe("weak_match");
    expect(verdict.summary).toBe("weak_match, 5 of 5 succeeded");
  });

  it("passes when the majority band is inside acceptableBands rather than expectedBand", () => {
    const verdict = pairVerdict({
      pairId: "boundary-seniority-gap",
      expectedBand: "not_a_match",
      acceptableBands: ["weak_match", "not_a_match"],
      tags: ["boundary"],
      outcomes: [
        scored("weak_match"),
        scored("weak_match"),
        scored("weak_match"),
        scored("not_a_match"),
        scored("not_a_match"),
      ],
    });

    expect(verdict.status).toBe("pass");
    expect(verdict.band).toBe("weak_match");
  });

  /**
   * STRICT, not "the most common". Two of four is the largest count in this
   * split and it still means the reruns disagreed. A `>=` here would call a
   * winner on a coin flip.
   */
  it("finds no majority in a 2 and 2 split, and reports no-majority without acceptableBands", () => {
    const verdict = pairVerdict({
      pairId: "control-one-gap",
      expectedBand: "good_match",
      tags: ["control"],
      outcomes: [
        scored("good_match"),
        scored("good_match"),
        scored("possible_match"),
        scored("possible_match"),
        failed,
      ],
    });

    expect(verdict.status).toBe("inconclusive");
    expect(verdict.inconclusiveReason).toBe("no-majority");
    expect(verdict.band).toBeUndefined();
    expect(verdict.summary).toBe(
      "2 good_match / 2 possible_match, 4 of 5 succeeded",
    );
  });

  it("finds no majority in a 1, 1, 1 split out of three successes", () => {
    const verdict = pairVerdict({
      pairId: "control-one-gap",
      expectedBand: "good_match",
      tags: ["control"],
      outcomes: [
        scored("strong_match"),
        scored("good_match"),
        scored("possible_match"),
      ],
    });

    expect(verdict.status).toBe("inconclusive");
    expect(verdict.inconclusiveReason).toBe("no-majority");
  });

  /**
   * AC-3's exception, and the reason `boundary-seniority-gap` exists: a pair
   * whose anchors genuinely cannot narrow to one band passes when every answer
   * landed inside the tolerance it declared, reporting the spread instead of a
   * winner it has no basis to name.
   */
  it("passes a no majority split when every success is inside acceptableBands", () => {
    const verdict = pairVerdict({
      pairId: "boundary-seniority-gap",
      expectedBand: "not_a_match",
      acceptableBands: ["weak_match", "not_a_match"],
      tags: ["boundary"],
      outcomes: [
        scored("weak_match"),
        scored("weak_match"),
        scored("not_a_match"),
        scored("not_a_match"),
      ],
    });

    expect(verdict.status).toBe("pass");
    expect(verdict.band).toBeUndefined();
    expect(verdict.distribution).toEqual({ weak_match: 2, not_a_match: 2 });
    expect(verdict.summary).toBe(
      "2 weak_match / 2 not_a_match, 4 of 4 succeeded",
    );
  });

  it("stays inconclusive on a no majority split that strays outside acceptableBands", () => {
    const verdict = pairVerdict({
      pairId: "boundary-seniority-gap",
      expectedBand: "not_a_match",
      acceptableBands: ["weak_match", "not_a_match"],
      tags: ["boundary"],
      outcomes: [
        scored("weak_match"),
        scored("weak_match"),
        scored("possible_match"),
        scored("possible_match"),
      ],
    });

    expect(verdict.status).toBe("inconclusive");
    expect(verdict.inconclusiveReason).toBe("no-majority");
  });
});

describe("pairVerdict, the stability probe rule (covers AC-4)", () => {
  it("passes only when every success is inside acceptableBands, with no majority computed", () => {
    const verdict = pairVerdict({
      pairId: "stability-probe-generic",
      expectedBand: "possible_match",
      acceptableBands: ["strong_match", "possible_match"],
      tags: ["stability-probe"],
      outcomes: [
        scored("strong_match"),
        scored("strong_match"),
        scored("strong_match"),
        scored("possible_match"),
        scored("possible_match"),
      ],
    });

    expect(verdict.status).toBe("pass");
    /** AC-4: always a distribution, never a lone band, even at 3 to 2. */
    expect(verdict.band).toBeUndefined();
    expect(verdict.summary).toBe(
      "3 strong_match / 2 possible_match, 5 of 5 succeeded",
    );
  });

  /**
   * THE RULE'S WHOLE POINT. Four of five matched and a plain majority vote
   * would have passed this comfortably. One success outside the observed set
   * means the input moved somewhere new, which is exactly what this pair
   * watches for.
   */
  it("fails on a single success outside acceptableBands even when the rest matched", () => {
    const verdict = pairVerdict({
      pairId: "stability-probe-generic",
      expectedBand: "possible_match",
      acceptableBands: ["strong_match", "possible_match"],
      tags: ["stability-probe"],
      outcomes: [
        scored("strong_match"),
        scored("strong_match"),
        scored("possible_match"),
        scored("possible_match"),
        scored("weak_match"),
      ],
    });

    expect(verdict.status).toBe("fail");
    expect(verdict.summary).toBe(
      "2 strong_match / 2 possible_match / 1 weak_match, 5 of 5 succeeded",
    );
  });

  /**
   * AC-4 applies "only once AC-3's own 3 of 5 successes floor is met". Both
   * successes here are inside the accepted set, so a probe rule checked first
   * would call this a clean pass; it is a broken run.
   */
  it("is still inconclusive below the success floor, even with every success acceptable", () => {
    const verdict = pairVerdict({
      pairId: "stability-probe-generic",
      expectedBand: "possible_match",
      acceptableBands: ["strong_match", "possible_match"],
      tags: ["stability-probe"],
      outcomes: [
        scored("strong_match"),
        scored("possible_match"),
        failed,
        failed,
        failed,
      ],
    });

    expect(verdict.status).toBe("inconclusive");
    expect(verdict.inconclusiveReason).toBe("insufficient-successes");
  });
});

describe("pairVerdict summaries (covers AC-6)", () => {
  /**
   * The invariant behind AC-6, asserted over every shape a verdict can take
   * rather than on one example: a reader must never be shown a band without
   * the denominator it rests on.
   */
  it("never produces a verdict line without its denominator", () => {
    const cases: readonly PairVerdict[] = [
      pairVerdict({
        pairId: "a",
        expectedBand: "strong_match",
        tags: ["control"],
        outcomes: fiveOf("strong_match"),
      }),
      pairVerdict({
        pairId: "b",
        expectedBand: "good_match",
        tags: ["control"],
        outcomes: [scored("good_match"), failed, failed],
      }),
      pairVerdict({
        pairId: "c",
        expectedBand: "not_a_match",
        acceptableBands: ["weak_match", "not_a_match"],
        tags: ["boundary"],
        outcomes: [
          scored("weak_match"),
          scored("weak_match"),
          scored("not_a_match"),
          scored("not_a_match"),
        ],
      }),
      pairVerdict({
        pairId: "d",
        expectedBand: "possible_match",
        acceptableBands: ["strong_match", "possible_match"],
        tags: ["stability-probe"],
        outcomes: [scored("strong_match"), scored("possible_match"), refused],
      }),
    ];

    for (const verdict of cases) {
      expect(verdict.summary).toContain(
        `${verdict.successes} of ${verdict.denominator} succeeded`,
      );
    }
  });

  it("says so plainly when nothing scored at all", () => {
    const verdict = pairVerdict({
      pairId: "control-direct-match",
      expectedBand: "strong_match",
      tags: ["control"],
      outcomes: [failed, failed, failed, failed, failed],
    });

    expect(verdict.summary).toBe("no scored band, 0 of 5 succeeded");
  });
});

/** A minimal passing verdict, for driving the cross pair comparison alone. */
function verdictOn(pairId: string, band: Band): PairVerdict {
  return pairVerdict({
    pairId,
    expectedBand: band,
    tags: ["preference-isolation"],
    outcomes: fiveOf(band),
  });
}

describe("preferenceLeakCheck (covers AC-5)", () => {
  const expectedBand: Band = "strong_match";

  it("reports consistent when all three land on the expected band", () => {
    const verdicts = new Map([
      ["preference-match", verdictOn("preference-match", "strong_match")],
      [
        "preference-violation",
        verdictOn("preference-violation", "strong_match"),
      ],
      [
        "preference-title-conflict",
        verdictOn("preference-title-conflict", "strong_match"),
      ],
    ]);

    expect(preferenceLeakCheck(verdicts, expectedBand)).toEqual({
      kind: "consistent",
      band: "strong_match",
    });
  });

  /**
   * All three moved together, so nothing about the differing preference text
   * distinguished itself. That is a rubric or model question, and calling it a
   * leak would send a reader looking in the wrong place.
   */
  it("reports baseline-drift when all three agree on a band that is not the expected one", () => {
    const verdicts = new Map([
      ["preference-match", verdictOn("preference-match", "good_match")],
      ["preference-violation", verdictOn("preference-violation", "good_match")],
      [
        "preference-title-conflict",
        verdictOn("preference-title-conflict", "good_match"),
      ],
    ]);

    expect(preferenceLeakCheck(verdicts, expectedBand)).toEqual({
      kind: "baseline-drift",
      band: "good_match",
      expectedBand: "strong_match",
    });
  });

  /**
   * The finding this trio of pairs exists for. The skill and experience text is
   * identical across all three, so a band that moves here has one available
   * explanation: the preference text that does differ.
   */
  it("reports preference-leak-suspected when the circumstances pair diverges", () => {
    const verdicts = new Map([
      ["preference-match", verdictOn("preference-match", "strong_match")],
      ["preference-violation", verdictOn("preference-violation", "good_match")],
      [
        "preference-title-conflict",
        verdictOn("preference-title-conflict", "strong_match"),
      ],
    ]);

    expect(preferenceLeakCheck(verdicts, expectedBand)).toEqual({
      kind: "preference-leak-suspected",
      baselineBand: "strong_match",
      divergent: [{ pairId: "preference-violation", band: "good_match" }],
    });
  });

  it("reports preference-leak-suspected when the title only pair diverges", () => {
    const verdicts = new Map([
      ["preference-match", verdictOn("preference-match", "strong_match")],
      [
        "preference-violation",
        verdictOn("preference-violation", "strong_match"),
      ],
      [
        "preference-title-conflict",
        verdictOn("preference-title-conflict", "possible_match"),
      ],
    ]);

    expect(preferenceLeakCheck(verdicts, expectedBand)).toEqual({
      kind: "preference-leak-suspected",
      baselineBand: "strong_match",
      divergent: [
        { pairId: "preference-title-conflict", band: "possible_match" },
      ],
    });
  });

  it("skips the check, naming the pair, when one of the three did not run", () => {
    const verdicts = new Map([
      ["preference-match", verdictOn("preference-match", "strong_match")],
      [
        "preference-violation",
        verdictOn("preference-violation", "strong_match"),
      ],
    ]);

    const outcome = preferenceLeakCheck(verdicts, expectedBand);

    expect(outcome.kind).toBe("leak-check-skipped");
    expect(outcome).toMatchObject({
      detail: expect.stringContaining("preference-title-conflict"),
    });
  });

  /**
   * An inconclusive pair has no band anyone can honestly compare. Comparing
   * against `undefined` would read as a divergence and manufacture a leak
   * finding out of a broken run.
   */
  it("skips the check when a pair has no single verdict band", () => {
    const verdicts = new Map([
      ["preference-match", verdictOn("preference-match", "strong_match")],
      [
        "preference-violation",
        pairVerdict({
          pairId: "preference-violation",
          expectedBand: "strong_match",
          tags: ["preference-isolation"],
          outcomes: [scored("strong_match"), failed, failed, failed, failed],
        }),
      ],
      [
        "preference-title-conflict",
        verdictOn("preference-title-conflict", "strong_match"),
      ],
    ]);

    const outcome = preferenceLeakCheck(verdicts, expectedBand);

    expect(outcome.kind).toBe("leak-check-skipped");
    expect(outcome).toMatchObject({
      detail: expect.stringContaining("insufficient-successes"),
    });
  });

  it("skips the check when the baseline itself did not run", () => {
    const verdicts = new Map([
      [
        "preference-violation",
        verdictOn("preference-violation", "strong_match"),
      ],
    ]);

    const outcome = preferenceLeakCheck(verdicts, expectedBand);

    expect(outcome.kind).toBe("leak-check-skipped");
    expect(outcome).toMatchObject({
      detail: expect.stringContaining(PREFERENCE_BASELINE_ID),
    });
  });
});

/**
 * The tie between AC-5's three pair ids and the committed set (AC-5).
 *
 * WHY THIS EXISTS. `PREFERENCE_BASELINE_ID` and `PREFERENCE_CONFLICT_IDS` are
 * plain strings with no compiler level tie to `pairs.ts`. Every consumer of
 * them already handles a miss gracefully, on purpose, because a `-t` filter can
 * genuinely exclude one of these pairs; that same graciousness is what makes a
 * rename invisible, since the leak check simply stops running and the run still
 * exits 0. Found in review on 2026-09-08.
 *
 * IT DRIVES THE REAL COMMITTED `PAIRS`, not a hand written fixture, because a
 * fixture would only prove the function reads a set it was handed. The first
 * test below is the one that actually fails the day someone renames a pair.
 */
describe("validatePreferenceIds (covers AC-5)", () => {
  it("holds against the real committed set today", () => {
    expect(validatePreferenceIds(PAIRS)).toEqual([]);
  });

  /**
   * The deliberate break, as a rename rather than a deletion, because a rename
   * is the case that was silent: the pair still exists and the set is still
   * valid by every other rule, so nothing else anywhere would notice.
   */
  it("names a pair that was renamed out from under it", () => {
    const renamed = PAIRS.map((pair) =>
      pair.id === PREFERENCE_BASELINE_ID
        ? { ...pair, id: "preference-baseline" }
        : pair,
    );

    expect(validatePreferenceIds(renamed)).toEqual([PREFERENCE_BASELINE_ID]);
  });

  it("names a renamed conflict pair, not only the baseline", () => {
    const renamed = PAIRS.map((pair) =>
      pair.id === "preference-violation"
        ? { ...pair, id: "preference-conflict" }
        : pair,
    );

    expect(validatePreferenceIds(renamed)).toEqual(["preference-violation"]);
  });

  it("names every missing id at once rather than stopping at the first", () => {
    expect(validatePreferenceIds([])).toEqual([
      PREFERENCE_BASELINE_ID,
      ...PREFERENCE_CONFLICT_IDS,
    ]);
  });

  /**
   * A pair being filtered out of a RUN is not the same as a pair being missing
   * from the SET, and only the second is this check's business. It is handed
   * the committed set, never the filtered subset, so a one pair debugging run
   * must not trip it.
   */
  it("reads the set it is given, so a filtered run is not its concern", () => {
    const onlyTheThree = PAIRS.filter(
      (pair) =>
        pair.id === PREFERENCE_BASELINE_ID ||
        PREFERENCE_CONFLICT_IDS.some((id) => id === pair.id),
    );

    expect(onlyTheThree).toHaveLength(3);
    expect(validatePreferenceIds(onlyTheThree)).toEqual([]);
  });
});
