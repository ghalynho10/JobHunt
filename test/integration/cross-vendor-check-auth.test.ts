import { describe, expect, it, vi } from "vitest";

import { checkFitScore } from "@/features/scoring/check";
import type { Listing } from "@/features/search/adzuna";
import { isFailure } from "@/lib/result";

import { createCookieJar } from "../helpers/cookie-jar";

/**
 * Spec 0019, the `## Critical test scenarios` auth case: `checkFitScore()`
 * called with no valid session returns `session_missing` before any vendor is
 * reached.
 *
 * WHY THIS FILE EXISTS WHEN BOTH HALVES WERE ALREADY COVERED. The guarantee
 * lived in two separate places that never met.
 * `test/integration/model-client-router.test.ts` proves the ROUTER refuses a
 * session-less `callTier("ai_check", …)`, and `check.test.ts` proves
 * `checkFitScore()` hands a `Failure` straight back with `callTier` replaced
 * by a stub. Neither drives the real function against the real gate, so a
 * change that made `checkFitScore()` swallow the failure, default it to a
 * clean verdict, or call the vendor before the gate would have passed both.
 * `/check verify` proved this end to end on 2026-09-09 with a throwaway probe
 * and then deleted it, which is exactly the kind of proof that should not
 * evaporate when the session ends. This is that probe, made durable.
 *
 * THE VENDOR IS STUBBED TO PROVE IT IS NEVER CALLED, not to avoid paying.
 * `expect(generateObject).not.toHaveBeenCalled()` is the assertion carrying
 * the "before any vendor is reached" half; without it this file would only
 * show that the right value came back, not that nothing was spent getting it.
 */

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateObject: vi.fn() };
});

const { generateObject } = await import("ai");

const listing: Listing = {
  source: "adzuna",
  sourceJobId: "auth-guard",
  title: "Senior Backend Engineer, Payments",
  companyName: "Contoso",
  location: "Berlin",
  url: "https://www.adzuna.com/land/ad/auth-guard",
  descriptionSnippet: "You will work in Go against PostgreSQL…",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryCurrency: undefined,
  salaryIsPredicted: false,
  postedAt: undefined,
};

describe("checkFitScore() with no session (spec 0019, auth, inherited from checkUsageGate)", () => {
  it("returns session_missing and never reaches the vendor", async () => {
    vi.mocked(generateObject).mockClear();

    const result = await checkFitScore(listing, ["Go"], createCookieJar());

    if (!isFailure(result)) {
      throw new Error(
        "Expected a Failure; a session-less caller must never get a verdict.",
      );
    }

    expect(result.kind).toBe("session_missing");
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("never returns a clean verdict, which would render as verified", async () => {
    /**
     * THE FAILURE MODE THIS GUARDS, stated as its own case. A signed out
     * caller getting `ungroundedSkills: []` back would render as AC-7's CLEAN
     * state, a card claiming a second vendor checked these skills when no
     * vendor was ever asked. That is this project's "no silent failures, and
     * never a default that reads like success" rule at its sharpest.
     *
     * STRENGTHENED 2026-09-10 after a Fable 5.1 review. This case used to
     * assert `isFailure(result)` alone, which was not the assertion that
     * locks the property: it passes whether the GATE refused the call or the
     * stubbed `generateObject` merely threw on being destructured, so the
     * test could not tell "no vendor was asked" from "the vendor stub blew
     * up". It now names the shape that must never come back, a success
     * carrying an allowed, empty verdict, and keeps the vendor assertion
     * beside it so both halves of the claim are checked in the same case.
     */
    vi.mocked(generateObject).mockClear();

    const result = await checkFitScore(
      listing,
      ["Go", "PostgreSQL"],
      createCookieJar(),
    );

    const isCleanVerdict =
      !isFailure(result) &&
      result.value.allowed &&
      result.value.value.ungroundedSkills.length === 0;

    expect(
      isCleanVerdict,
      "A session-less caller got a clean verdict. That renders as AC-7's clean state: a card claiming a second vendor verified these skills when none was asked.",
    ).toBe(false);

    expect(generateObject).not.toHaveBeenCalled();
  });
});
