import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Listing } from "@/features/search/adzuna";
import { failure, success } from "@/lib/result";

import type { ScoringProfile } from "./rubric";

const scoreListing = vi.hoisted(() => vi.fn());
vi.mock("./score", () => ({ scoreListing }));

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

beforeEach(() => {
  vi.clearAllMocks();
  openedSpans.length = 0;
  recordedAttributes.length = 0;
  scoreListing.mockResolvedValue(aScore);
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
      return success({ allowed: true, value: { tag: listing.sourceJobId } });
    });

    const outcomes = await scoreListings(profile, listings(5));

    expect(
      outcomes.map((outcome) =>
        outcome.ok && outcome.value.allowed
          ? (outcome.value.value as unknown as { tag: string }).tag
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

    expect(recordedAttributes).toEqual([{ scored: 2, refused: 1, failed: 1 }]);
  });

  it("still opens a span for a render with no listings at all", async () => {
    await scoreListings(profile, []);

    expect(openedSpans).toHaveLength(1);
    expect(scoreListing).not.toHaveBeenCalled();
  });
});
