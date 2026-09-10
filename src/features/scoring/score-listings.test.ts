import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Listing } from "@/features/search/adzuna";
import { failure, success } from "@/lib/result";

import type { ScoringProfile } from "./rubric";

const scoreListing = vi.hoisted(() => vi.fn());
vi.mock("./score", () => ({ scoreListing }));

/**
 * `checkFitScore` IS REPLACED FOR THE SAME REASON `scoreListing` IS (spec
 * 0019). Its own behaviour is a Google call, proved against a real vendor in
 * `test/integration/cross-vendor-check-live.test.ts` and as a pure function in
 * `check.test.ts`. What is under test here is the CHAIN: that a check follows
 * a score rather than racing it, that the two skips spend nothing, and that
 * the span's four new counts partition `scored`.
 */
const checkFitScore = vi.hoisted(() => vi.fn());
vi.mock("./check", () => ({ checkFitScore }));

/**
 * What the span recorded, filled by the wrapper below.
 *
 * A PROXY OVER THE REAL MODULE, NOT A SPREAD, and not a replacement either.
 * This is the pattern `src/features/auth/actions.test.ts` already established
 * here, for a reason worth restating: `@sentry/nextjs` re-exports most of its
 * surface, spreading the namespace silently drops some of it, and the symptom
 * turns up far away as `result.ts` failing to find `getActiveSpan` while
 * building an ordinary failure. Falling through to the real module for every
 * other name means this wrapper can only ever change the one function it names.
 *
 * THE REAL `startSpan` STILL RUNS THE CALLBACK, so binding rule 4 is proved by
 * the span actually existing rather than by a stub agreeing that it should.
 */
const openedSpans: { name: string; attributes?: Record<string, unknown> }[] =
  [];
const recordedAttributes: Record<string, unknown>[] = [];

const actualSentry =
  await vi.importActual<typeof import("@sentry/nextjs")>("@sentry/nextjs");

const recordingStartSpan = (
  options: { name: string; attributes?: Record<string, unknown> },
  callback: (span: unknown) => unknown,
): unknown => {
  openedSpans.push({ name: options.name, attributes: options.attributes });

  return actualSentry.startSpan(
    options as Parameters<typeof actualSentry.startSpan>[0],
    ((span: object) =>
      callback(
        /** The same fall through trick, one level down, for the span itself. */
        new Proxy(span, {
          get: (target, property, receiver) =>
            property === "setAttributes"
              ? (attributes: Record<string, unknown>) => {
                  recordedAttributes.push(attributes);
                }
              : Reflect.get(target, property, receiver),
        }),
      )) as Parameters<typeof actualSentry.startSpan>[1],
  );
};

vi.doMock(
  "@sentry/nextjs",
  () =>
    new Proxy(actualSentry, {
      get: (target, property, receiver) =>
        property === "startSpan"
          ? recordingStartSpan
          : Reflect.get(target, property, receiver),
    }),
);

const { scoreListings } = await import("./score-listings");

/**
 * Dispatching a whole render's worth of scoring at once (spec 0015, AC-8,
 * AC-14).
 *
 * `scoreListing` IS REPLACED HERE. Its own behaviour is a vendor call, proved
 * against a real vendor in `test/integration/fit-scoring-live.test.ts` behind
 * `TEST_LIVE_MODEL_CALLS_ENABLED`. What is under test in this file is the
 * batch: that it fires rather than queues, that outcomes come back paired with
 * the listing that produced them, and that the span carries the three counts an
 * operator would actually alert on.
 */

const profile: ScoringProfile = {
  summary: undefined,
  skills: ["Go"],
  experience: [],
  preferences: undefined,
};

const listings = (count: number): readonly Listing[] =>
  Array.from(
    { length: count },
    (_unused, index) =>
      ({
        source: "adzuna",
        sourceJobId: String(index),
        title: `Job ${index}`,
        companyName: "Acme",
        location: undefined,
        url: `https://www.adzuna.com/land/ad/${index}`,
        descriptionSnippet: undefined,
        salaryMin: undefined,
        salaryMax: undefined,
        salaryCurrency: undefined,
        salaryIsPredicted: false,
        postedAt: undefined,
      }) as Listing,
  );

const aScore = success({
  allowed: true,
  value: {
    band: "good_match",
    /**
     * EMPTY, SO THE DEFAULT PATH THROUGH THIS FILE SPENDS NO CHECK CALL (spec
     * 0019, AC-4). Every spec 0015 assertion below is about the scoring half,
     * and a default that claimed a skill would quietly put a second vendor
     * call inside each of them.
     */
    matchedSkills: [],
    notMentionedSkills: [],
    reasoning: "ok",
    sponsorshipSignal: "not_stated",
  },
});

const aRefusal = success({
  allowed: false,
  reason: "account_week_cap_reached",
});

const aFailure = failure({
  kind: "external_service_failed",
  severity: "unexpected",
  message: "vendor down",
});

/** A score that claims one skill, so the chain reaches the check (AC-5). */
const aClaimingScore = success({
  allowed: true,
  value: {
    band: "good_match",
    matchedSkills: ["Go"],
    notMentionedSkills: [],
    reasoning: "ok",
    sponsorshipSignal: "not_stated",
  },
});

const aCleanCheck = success({ allowed: true, value: { ungroundedSkills: [] } });

const aFlaggedCheck = success({
  allowed: true,
  value: { ungroundedSkills: ["Go"] },
});

const aCheckRefusal = success({
  allowed: false,
  reason: "global_day_cap_reached",
});

const aCheckFailure = failure({
  kind: "external_service_failed",
  severity: "unexpected",
  message: "check vendor down",
});

beforeEach(() => {
  vi.clearAllMocks();
  openedSpans.length = 0;
  recordedAttributes.length = 0;
  scoreListing.mockResolvedValue(aScore);
  checkFitScore.mockResolvedValue(aCleanCheck);
});

describe("dispatching (AC-3, AC-8)", () => {
  it("calls once per listing, never batched into one call", async () => {
    await scoreListings(profile, listings(20));

    expect(scoreListing).toHaveBeenCalledTimes(20);
  });

  it("fires them concurrently rather than one after another", async () => {
    /**
     * THE ASSERTION THAT ACTUALLY PROVES CONCURRENCY, rather than timing the
     * batch and hoping. Every call is held open until all twenty have STARTED;
     * if this ran in series the first call would wait forever for a release
     * that only arrives once the twentieth begins, and the test would time out
     * rather than pass slowly. Twenty sequential 30 second calls is ten
     * minutes, which is the outcome AC-8 exists to prevent.
     */
    let started = 0;
    let release = () => {};
    const allStarted = new Promise<void>((resolve) => {
      release = resolve;
    });

    scoreListing.mockImplementation(async () => {
      started += 1;
      if (started === 20) release();
      await allStarted;
      return aScore;
    });

    await scoreListings(profile, listings(20));

    expect(started).toBe(20);
  });

  it("returns one outcome per listing, in the order the listings arrived", async () => {
    /**
     * AC-9 pairs an outcome back to its card by `sourceJobId`, and that pairing
     * is built from this order. A batch that resolved out of order would put
     * every score on the wrong job with nothing looking broken.
     */
    scoreListing.mockImplementation(async (_profile, listing: Listing) => {
      /** The later listings resolve first, to make an order bug visible. */
      await new Promise((resolve) =>
        setTimeout(resolve, 10 - Number(listing.sourceJobId)),
      );
      return success({
        allowed: true,
        value: { tag: listing.sourceJobId, matchedSkills: [] },
      });
    });

    const outcomes = await scoreListings(profile, listings(5));

    expect(
      outcomes.map(({ score }) =>
        score.ok && score.value.allowed
          ? (score.value.value as unknown as { tag: string }).tag
          : undefined,
      ),
    ).toEqual(["0", "1", "2", "3", "4"]);
  });

  it("passes the caller's own bounded profile to every call", async () => {
    await scoreListings(profile, listings(3));

    for (const call of scoreListing.mock.calls) {
      expect(call[0]).toBe(profile);
    }
  });
});

describe("the span (AC-14)", () => {
  it("opens as the first statement, carrying the listing count", async () => {
    /**
     * BINDING RULE 4. The count is on the span at OPEN time, not at close, so a
     * total vendor outage that never resolves still leaves a denominator
     * behind. Asserted on the options object handed to `startSpan`, which is
     * the only place that timing is observable.
     */
    await scoreListings(profile, listings(7));

    expect(openedSpans).toEqual([
      { name: "scoring.score_listings", attributes: { listings: 7 } },
    ]);
  });

  it("tallies scored, refused and failed separately once every outcome lands", async () => {
    /**
     * THREE COUNTS, NOT A PASS RATE. Twenty refusals is the budget working;
     * twenty failures is an incident. A single ratio would read both the same,
     * and this span has no failures of its own to distinguish them by, since
     * every outcome is a value rather than a throw.
     */
    scoreListing
      .mockResolvedValueOnce(aScore)
      .mockResolvedValueOnce(aScore)
      .mockResolvedValueOnce(aRefusal)
      .mockResolvedValueOnce(aFailure);

    await scoreListings(profile, listings(4));

    expect(recordedAttributes).toEqual([
      {
        scored: 2,
        refused: 1,
        failed: 1,
        /**
         * Spec 0019's four, on the same recording. Both scored listings
         * claimed no skills, so both land in `checkSkippedEmpty` and no
         * `ai_check` call was spent; the refused and the failed listing are
         * in none of the four, because AC-5 never let a check near them.
         */
        checked: 0,
        checkSkippedEmpty: 2,
        flagged: 0,
        checkUnverifiable: 0,
      },
    ]);
  });

  it("still opens a span for a render with no listings at all", async () => {
    await scoreListings(profile, []);

    expect(openedSpans).toHaveLength(1);
    expect(scoreListing).not.toHaveBeenCalled();
  });
});

describe("chaining the check onto the score (spec 0019, AC-4, AC-5)", () => {
  it("checks a listing that claimed a skill, with that listing's own claims", async () => {
    scoreListing.mockResolvedValue(aClaimingScore);

    await scoreListings(profile, listings(1));

    expect(checkFitScore).toHaveBeenCalledTimes(1);

    const [listing, claimed] = checkFitScore.mock.calls[0] ?? [];

    /**
     * THE SAME LISTING OBJECT, and the claims from THAT listing's own score.
     * A batch that passed the right count of calls with the wrong pairing
     * would check one job's claims against another job's text, and every
     * count on the span would still look correct.
     */
    expect((listing as { sourceJobId: string }).sourceJobId).toBe("0");
    expect(claimed).toEqual(["Go"]);
  });

  it("spends no check call when the score claimed nothing (AC-4)", async () => {
    scoreListing.mockResolvedValue(aScore);

    const outcomes = await scoreListings(profile, listings(20));

    expect(checkFitScore).not.toHaveBeenCalled();
    expect(outcomes.map(({ check }) => check)).toEqual(
      Array.from({ length: 20 }, () => "skipped_no_skills"),
    );
  });

  it("spends no check call when the score refused or failed (AC-5)", async () => {
    /**
     * THE BUDGET HALF OF AC-5, and it is the assertion that matters more than
     * the shape one. A check dispatched after a refused score would spend
     * `ai_check` budget to verify claims that do not exist, on exactly the
     * render where the caller has already run out of room.
     */
    scoreListing
      .mockResolvedValueOnce(aRefusal)
      .mockResolvedValueOnce(aFailure);

    const outcomes = await scoreListings(profile, listings(2));

    expect(checkFitScore).not.toHaveBeenCalled();
    expect(outcomes.map(({ check }) => check)).toEqual([
      "skipped_no_score",
      "skipped_no_score",
    ]);
  });

  it("waits for the score before the check, rather than racing them", async () => {
    /**
     * THE ORDERING AC-5 RESTS ON, proved by construction rather than by
     * timing. The check is held open until the score has resolved; if the two
     * were fired together the check would run with claims that did not exist
     * yet, and the only visible symptom would be a verdict about an empty
     * list.
     */
    let scoreResolved = false;

    scoreListing.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      scoreResolved = true;
      return aClaimingScore;
    });
    checkFitScore.mockImplementation(async () => {
      expect(scoreResolved).toBe(true);
      return aCleanCheck;
    });

    await scoreListings(profile, listings(3));

    expect(checkFitScore).toHaveBeenCalledTimes(3);
  });

  it("keeps each listing's score and check together in one outcome", async () => {
    scoreListing.mockResolvedValue(aClaimingScore);
    checkFitScore
      .mockResolvedValueOnce(aFlaggedCheck)
      .mockResolvedValue(aCleanCheck);

    const outcomes = await scoreListings(profile, listings(3));

    expect(outcomes).toHaveLength(3);
    expect(outcomes[0]?.check).toBe(aFlaggedCheck);
    expect(outcomes[1]?.check).toBe(aCleanCheck);
    expect(outcomes[2]?.check).toBe(aCleanCheck);
    for (const outcome of outcomes) expect(outcome.score).toBe(aClaimingScore);
  });
});

describe("the span's four check counts (spec 0019, AC-10)", () => {
  const recorded = () => recordedAttributes[0] as Record<string, number>;

  it("counts a clean and a flagged check alike under checked, flagged only the flagged", async () => {
    /**
     * `flagged` IS A SUBSET OF `checked`, NEVER A FOURTH SIBLING (AC-10). A
     * flagged check ran and returned a value, so it is a completed check that
     * happened to dispute something. Counting it outside `checked` would make
     * a day of many flags read as a day of few completed checks.
     */
    scoreListing.mockResolvedValue(aClaimingScore);
    checkFitScore
      .mockResolvedValueOnce(aFlaggedCheck)
      .mockResolvedValueOnce(aCleanCheck)
      .mockResolvedValueOnce(aCleanCheck);

    await scoreListings(profile, listings(3));

    expect(recorded()["checked"]).toBe(3);
    expect(recorded()["flagged"]).toBe(1);
  });

  it("counts a refused and a failed check alike under checkUnverifiable", async () => {
    scoreListing.mockResolvedValue(aClaimingScore);
    checkFitScore
      .mockResolvedValueOnce(aCheckRefusal)
      .mockResolvedValueOnce(aCheckFailure);

    await scoreListings(profile, listings(2));

    expect(recorded()["checkUnverifiable"]).toBe(2);
    expect(recorded()["checked"]).toBe(0);
    expect(recorded()["flagged"]).toBe(0);
  });

  it("counts an empty claim list under checkSkippedEmpty, never under checked", async () => {
    /**
     * AC-4's own sentence: a page of listings with nothing claimed must never
     * read as a page of verified ones. These two counts are the whole
     * difference between those two days on a dashboard.
     */
    scoreListing.mockResolvedValue(aScore);

    await scoreListings(profile, listings(4));

    expect(recorded()["checkSkippedEmpty"]).toBe(4);
    expect(recorded()["checked"]).toBe(0);
  });

  it("partitions scored across the three, on every mix of outcomes", async () => {
    /**
     * THE IDENTITY AC-10 EXISTS TO PROTECT: `scored` equals
     * `checked + checkSkippedEmpty + checkUnverifiable`, always. Without it,
     * these four counts can silently stop partitioning `scored` the way they
     * do today, and an operator reading the dashboard would have no way to
     * tell. It is asserted over a MIX rather than one case, because any
     * single case can be satisfied by a partition that is wrong elsewhere.
     *
     * WHAT THIS TEST DOES NOT CATCH, corrected 2026-09-10 after a Fable 5.1
     * review: a FIFTH variant added to `ListingOutcome["check"]` and tallied
     * nowhere. This comment used to claim exactly that, and it was wrong,
     * because a test can only construct variants that already exist. That
     * case is caught by the compiler instead: `score-listings.ts` narrows
     * every variant and exhausts the string ones against `never`, so a new
     * one fails `tsc`. The division is worth keeping straight, since the
     * wrong half was being trusted: **the type check guards the partition's
     * completeness, this test proves the arithmetic over the variants that
     * exist today.**
     */
    scoreListing
      .mockResolvedValueOnce(aClaimingScore)
      .mockResolvedValueOnce(aClaimingScore)
      .mockResolvedValueOnce(aClaimingScore)
      .mockResolvedValueOnce(aScore)
      .mockResolvedValueOnce(aRefusal)
      .mockResolvedValueOnce(aFailure);
    checkFitScore
      .mockResolvedValueOnce(aFlaggedCheck)
      .mockResolvedValueOnce(aCleanCheck)
      .mockResolvedValueOnce(aCheckFailure);

    await scoreListings(profile, listings(6));

    const at = (key: string): number => recorded()[key] ?? Number.NaN;

    expect(at("scored")).toBe(4);
    expect(at("checked")).toBe(2);
    expect(at("checkSkippedEmpty")).toBe(1);
    expect(at("checkUnverifiable")).toBe(1);
    expect(
      at("checked") + at("checkSkippedEmpty") + at("checkUnverifiable"),
    ).toBe(at("scored"));
  });

  it("records them on the same setAttributes call as the scoring three", async () => {
    /**
     * ONE RECORDING, ONCE EVERY OUTCOME HAS RESOLVED (AC-10). Two separate
     * writes would let a span carry the scoring counts from a finished batch
     * beside check counts from a half finished one, and the identity above
     * would then be false on a real span while passing here.
     */
    scoreListing.mockResolvedValue(aClaimingScore);

    await scoreListings(profile, listings(2));

    expect(recordedAttributes).toHaveLength(1);
    expect(Object.keys(recorded()).sort()).toEqual([
      "checkSkippedEmpty",
      "checkUnverifiable",
      "checked",
      "failed",
      "flagged",
      "refused",
      "scored",
    ]);
  });
});
