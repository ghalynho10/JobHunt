import { beforeEach, describe, expect, it, vi } from "vitest";

import { ADZUNA_SOURCE } from "@/lib/adzuna";
import type { Listing } from "@/features/search/adzuna";
import { buildScoringPrompt } from "@/features/scoring/rubric";
import { success } from "@/lib/result";

import { DEMO_PERSONAS } from "./personas";

/**
 * What the refresh actually sends the scorer (spec 0021, verify.md's **Value
 * sourcing** row "The scoring inputs").
 *
 * THE CLAIM UNDER TEST IS NARROW AND EASY TO BREAK QUIETLY: the prompt carries
 * the persona constant UNCHANGED, not a re-derived or re-bounded copy of it.
 * The page shows both candidates in full precisely so a reader can check a band
 * against what the scorer was told, and that disclosure is worth nothing the
 * moment the two drift. A copy that truncated a skill list, re-sorted it, or
 * re-ran `boundProfile()`'s caps over an already bounded profile would leave
 * the page showing one candidate and the scorer judging another, with nothing
 * failing anywhere.
 *
 * ONLY THE VENDOR IS REPLACED. `callTier()` is the HTTP boundary and the one
 * thing here that costs money; everything between it and the persona constant
 * is the real code, so the captured prompt is the real prompt. That is the
 * whole reason this is worth a test rather than a reading of the source: it
 * runs `scoreListings()` → `scoreListing()` → `buildScoringPrompt()` end to
 * end, the same chain `refreshDemoResults()` runs at `refresh.ts`'s one
 * `scoreListings(persona.profile, listings, session.value)` call.
 *
 * WHAT IT DOES NOT PROVE is that `refresh.ts` passes `persona.profile` rather
 * than a copy it built first. Driving `refreshDemoResults()` itself would need
 * the session mint, Adzuna and the database all replaced, which is four mocks
 * of modules this project owns to pin one argument. That line stays a review
 * and `/check verify` concern; this file pins everything downstream of it.
 */

const callTier = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ai/client", () => ({ callTier }));

const { scoreListings } = await import("@/features/scoring/score-listings");

/** One real shaped posting. Its content is irrelevant; the candidate is not. */
const LISTING: Listing = {
  source: ADZUNA_SOURCE,
  sourceJobId: "demo-prompt-1",
  title: "Platform Engineer",
  companyName: "Example Systems",
  location: "Remote",
  url: "https://example.test/platform-engineer",
  descriptionSnippet:
    "Build and operate the services the rest of the company deploys onto.",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryCurrency: undefined,
  salaryIsPredicted: false,
  postedAt: undefined,
};

/** A minimal allowed score, so `scoreListing()` reaches its normal return. */
const ALLOWED_SCORE = {
  allowed: true as const,
  value: {
    band: "possible_match",
    matchedSkills: [],
    notMentionedSkills: [],
    reasoning: "A stub verdict. This test is about the prompt, not the score.",
    /**
     * EMPTY `matchedSkills` IS LOAD BEARING, not a lazy fixture. It is what
     * makes `scoreThenCheck()` skip the grounding check (spec 0019, AC-4), so
     * `callTier` is called exactly once per listing and the capture below is
     * unambiguously the SCORING prompt rather than the check's.
     */
    sponsorshipSignal: "not_stated",
  },
};

beforeEach(() => {
  callTier.mockReset();
  callTier.mockResolvedValue(success(ALLOWED_SCORE));
});

/** The prompt `callTier()` was handed on its single call. */
function capturedPrompt(): string {
  expect(callTier).toHaveBeenCalledTimes(1);

  const prompt: unknown = callTier.mock.calls[0]?.[2];

  if (typeof prompt !== "string") {
    throw new Error("callTier was not handed a prompt string.");
  }

  return prompt;
}

describe.each(DEMO_PERSONAS)("the $slug persona's prompt", (persona) => {
  it("is byte for byte the render of the persona constant itself", async () => {
    await scoreListings(persona.profile, [LISTING]);

    /**
     * TWO WHOLE RENDERS COMPARED, NOT A SEARCH FOR A FEW FIELDS INSIDE ONE.
     * A `toContain` per field passes just as happily on a prompt that also
     * carries a re-bounded copy, or one where a field was re-ordered around
     * the pieces being looked for. The 2026-09-07 reflex names this shape
     * exactly: breaking a test proves it fires, not that it compares the
     * right span.
     */
    expect(capturedPrompt()).toBe(buildScoringPrompt(persona.profile, LISTING));
  });

  it("carries every listed skill, in the constant's own order", async () => {
    await scoreListings(persona.profile, [LISTING]);

    /**
     * THE JOINED LIST, NOT EACH NAME SEPARATELY. `buildScoringPrompt()` writes
     * the skills as one comma separated line, so comparing that whole line
     * catches a truncation, a re-sort and a dropped name alike, where a loop of
     * `toContain` would miss the first two.
     */
    expect(capturedPrompt()).toContain(persona.profile.skills.join(", "));
  });

  it("carries the summary in full, never a shortened one", async () => {
    const { summary } = persona.profile;

    if (summary === undefined) throw new Error("This persona has no summary.");

    await scoreListings(persona.profile, [LISTING]);

    expect(capturedPrompt()).toContain(summary);
  });

  it("carries every work history entry, description included", async () => {
    await scoreListings(persona.profile, [LISTING]);

    const prompt = capturedPrompt();

    for (const entry of persona.profile.experience) {
      expect(prompt).toContain(
        `- ${entry.title} at ${entry.company} (${entry.startedOn} to ${entry.endedOn ?? "present"})`,
      );

      if (entry.description !== undefined) {
        expect(prompt).toContain(entry.description);
      }
    }
  });

  it("carries the stated preferences the page discloses", async () => {
    const { preferences } = persona.profile;

    if (preferences === undefined) {
      throw new Error("This persona has no preferences.");
    }

    await scoreListings(persona.profile, [LISTING]);

    const prompt = capturedPrompt();

    expect(prompt).toContain(
      `- Desired titles: ${preferences.desired_titles.join(", ")}`,
    );
    expect(prompt).toContain(
      `- Desired locations: ${preferences.desired_locations.join(", ")}`,
    );
    expect(prompt).toContain(
      `- Remote preference: ${preferences.remote_preference}`,
    );
  });

  it("leaves the persona constant itself untouched", async () => {
    /**
     * THE CONSTANT IS MODULE LEVEL AND SHARED WITH THE PAGE, so a scoring path
     * that sorted or spliced it in place would change what the disclosure
     * renders for every later request in the same process, and only in
     * production where the module is long lived.
     */
    const before = structuredClone(persona.profile);

    await scoreListings(persona.profile, [LISTING]);

    expect(persona.profile).toEqual(before);
  });
});

describe("the two personas are told different things", () => {
  /**
   * THE GUARD AGAINST A PROMPT THAT IGNORES ITS PROFILE ARGUMENT. Every
   * assertion above is derived from the persona it is checking, so a
   * `buildScoringPrompt()` that dropped the profile entirely and rendered only
   * the posting would still satisfy the byte for byte comparison: both sides
   * would be equally empty of the candidate. Comparing the two personas'
   * prompts against each other is what makes that case impossible.
   */
  it("renders two different prompts for the same listing", async () => {
    const prompts: string[] = [];

    for (const persona of DEMO_PERSONAS) {
      callTier.mockClear();
      await scoreListings(persona.profile, [LISTING]);
      prompts.push(capturedPrompt());
    }

    const [first, second] = prompts;

    expect(first).not.toBe(second);
  });
});
