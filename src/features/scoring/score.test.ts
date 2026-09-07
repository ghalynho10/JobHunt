import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Listing } from "@/features/search/adzuna";
import { failure, isFailure, success } from "@/lib/result";

import {
  SCORING_SYSTEM_PROMPT,
  buildScoringPrompt,
  fitScoreSchema,
  type FitScore,
  type ScoringProfile,
} from "./rubric";

/**
 * `callTier` alone is replaced, at the module boundary spec 0012 owns.
 *
 * WHAT THIS FILE IS FOR. `scoreListing()` is the seam that ties the vendor call
 * to AC-5's post parse filter, and it was reachable by no unit test at all
 * until the 2026-09-07 fresh model review named the gap. `score-listings.test.ts`
 * mocks this whole module away, so it never runs this function, and
 * `test/integration/fit-scoring-live.test.ts` sits behind
 * `TEST_LIVE_MODEL_CALLS_ENABLED`, unset by default, so neither `pnpm test` nor
 * a plain `pnpm test:integration` reaches it either. A change that dropped the
 * `normalizeFitScore()` call, applied it to the wrong branch, or broke a
 * passthrough would have compiled and passed everything.
 *
 * REPLACING `callTier` IS NOT RESTATING THE ASSUMPTION UNDER TEST. Its own
 * behaviour, the gate, the span and the vendor error classification, is proved
 * in `src/lib/ai/client.test.ts` and against the real local stack in
 * `test/integration/model-client-router.test.ts`. What is under test here is
 * only what this function adds around it: what it sends, and what it does to
 * what comes back.
 */
const callTier = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/client", () => ({ callTier }));

const { scoreListing } = await import("./score");

const profile: ScoringProfile = {
  summary: "Backend engineer, ten years, mostly payments.",
  skills: ["Go", "PostgreSQL"],
  experience: [],
  preferences: undefined,
};

const listing: Listing = {
  source: "adzuna",
  sourceJobId: "111",
  title: "Senior Backend Engineer",
  companyName: "Northwind Labs",
  location: "Berlin",
  url: "https://www.adzuna.com/land/ad/111",
  descriptionSnippet: "Go and Postgres, payments team.",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryCurrency: undefined,
  salaryIsPredicted: false,
  postedAt: undefined,
};

/** What the vendor is pretending to have returned, before any filtering. */
const vendorAnswer: FitScore = {
  band: "good_match",
  /** `postgresql` is the caller's own skill in the model's casing; `Rust` is not theirs at all. */
  matchedSkills: ["postgresql", "Rust"],
  /** `PostgreSQL` is claimed in both arrays at once, which is a contradiction. */
  notMentionedSkills: ["Go", "PostgreSQL"],
  reasoning: "Your payments work carries over.",
  sponsorshipSignal: "not_stated",
};

beforeEach(() => {
  vi.clearAllMocks();
  callTier.mockResolvedValue(success({ allowed: true, value: vendorAnswer }));
});

describe("what scoreListing sends (AC-3, AC-13)", () => {
  it("makes exactly one ai_scoring call for one listing, never batched", async () => {
    // covers: AC-3
    await scoreListing(profile, listing);

    expect(callTier).toHaveBeenCalledTimes(1);
    expect(callTier.mock.calls[0]?.[0]).toBe("ai_scoring");
  });

  it("sends the rubric's own prompt and system prompt, not a second copy of them", async () => {
    /**
     * Asserted against `buildScoringPrompt()` itself rather than against a
     * pasted string. A literal here would be a second copy of the prompt that
     * drifts silently the moment `rubric.ts` changes, and it would prove that
     * this test knows the prompt rather than that this function passes it on.
     * What the prompt CONTAINS is `rubric.test.ts`'s subject, including AC-13's
     * bound on what leaves for a vendor.
     */
    await scoreListing(profile, listing);

    expect(callTier.mock.calls[0]?.[2]).toBe(
      buildScoringPrompt(profile, listing),
    );
    expect(callTier.mock.calls[0]?.[3]).toMatchObject({
      system: SCORING_SYSTEM_PROMPT,
    });
  });

  it("sends the schema object itself, so the wire shape cannot drift from the parsed one", async () => {
    await scoreListing(profile, listing);

    expect(callTier.mock.calls[0]?.[1]).toBe(fitScoreSchema);
  });

  it("omits the cookie adapter entirely when no caller passed one", async () => {
    /**
     * The real callers pass nothing, and `callTier()` reads `options.cookieAdapter`
     * as absent versus present rather than as defined versus undefined. Spreading
     * an explicit `cookieAdapter: undefined` in would be a different value.
     */
    await scoreListing(profile, listing);

    expect(callTier.mock.calls[0]?.[3]).not.toHaveProperty("cookieAdapter");
  });

  it("passes the test seam straight through when one is given", async () => {
    const cookieAdapter = { getAll: () => [], setAll: () => {} };

    await scoreListing(profile, listing, cookieAdapter);

    expect(
      (callTier.mock.calls[0]?.[3] as { cookieAdapter?: unknown })
        .cookieAdapter,
    ).toBe(cookieAdapter);
  });
});

describe("what scoreListing does with the answer (AC-5)", () => {
  it("drops a skill name the caller does not actually have", async () => {
    /**
     * THE ONE OUTCOME THIS FEATURE'S CENTRAL GUARANTEE EXISTS TO PREVENT: a
     * skill on the reader's own screen, under their own name, that they never
     * claimed. `Rust` is the model's invention and must not survive this call.
     */
    // covers: AC-5
    const outcome = await scoreListing(profile, listing);

    expect(outcome.ok && outcome.value.allowed).toBe(true);
    if (!outcome.ok || !outcome.value.allowed) return;

    expect(outcome.value.value.matchedSkills).not.toContain("Rust");
  });

  it("renders the caller's own spelling back, not the model's casing", async () => {
    // covers: AC-5
    const outcome = await scoreListing(profile, listing);

    expect(outcome.ok && outcome.value.allowed).toBe(true);
    if (!outcome.ok || !outcome.value.allowed) return;

    expect(outcome.value.value.matchedSkills).toEqual(["PostgreSQL"]);
  });

  it("never lists one skill as both matched and not mentioned", async () => {
    /**
     * The filter runs BEFORE this function returns, so nothing downstream has
     * to remember to run it. Without it the same chip renders twice on one
     * card, under two headings that contradict each other.
     */
    // covers: AC-5
    const outcome = await scoreListing(profile, listing);

    expect(outcome.ok && outcome.value.allowed).toBe(true);
    if (!outcome.ok || !outcome.value.allowed) return;

    expect(outcome.value.value.notMentionedSkills).toEqual(["Go"]);
  });

  it("leaves the band, the reasoning and the sponsorship signal alone", async () => {
    const outcome = await scoreListing(profile, listing);

    expect(outcome.ok && outcome.value.allowed).toBe(true);
    if (!outcome.ok || !outcome.value.allowed) return;

    expect(outcome.value.value).toMatchObject({
      band: "good_match",
      reasoning: "Your payments work carries over.",
      sponsorshipSignal: "not_stated",
    });
  });

  it("filters against the profile that entered the prompt, not some wider list", async () => {
    /**
     * A caller with no skills at all is the sharpest version of the rule: every
     * name the model returns is then unclaimed, so both arrays empty out rather
     * than passing anything through.
     */
    // covers: AC-5
    const outcome = await scoreListing({ ...profile, skills: [] }, listing);

    expect(outcome.ok && outcome.value.allowed).toBe(true);
    if (!outcome.ok || !outcome.value.allowed) return;

    expect(outcome.value.value.matchedSkills).toEqual([]);
    expect(outcome.value.value.notMentionedSkills).toEqual([]);
  });
});

describe("what scoreListing does NOT touch (AC-10, AC-11)", () => {
  it("passes a vendor failure through unchanged, so one card can fail alone", async () => {
    /**
     * THE THREE OUTCOMES STAY STRUCTURALLY DISTINCT. `toBe` rather than
     * `toEqual` on purpose: the failure is handed back as the same object, so
     * nothing here can quietly rebuild it into a shape that reads like a score.
     */
    // covers: AC-10
    const vendorFailure = failure({
      kind: "external_service_failed",
      severity: "unexpected",
      message: "vendor down",
    });
    callTier.mockResolvedValue(vendorFailure);

    const outcome = await scoreListing(profile, listing);

    expect(outcome).toBe(vendorFailure);
    expect(isFailure(outcome)).toBe(true);
  });

  it("passes a gate refusal through unchanged, so a spent budget is not an error", async () => {
    /**
     * A refusal is a `Result` SUCCESS carrying `allowed: false`, which is what
     * keeps the gate working as designed out of `ai.call_tier`'s failure ratio
     * and lets the page render a cap notice rather than twenty error cards.
     */
    // covers: AC-11
    const refusal = success({
      allowed: false,
      reason: "account_week_cap_reached",
    });
    callTier.mockResolvedValue(refusal);

    const outcome = await scoreListing(profile, listing);

    expect(outcome).toBe(refusal);
    expect(isFailure(outcome)).toBe(false);
  });
});
