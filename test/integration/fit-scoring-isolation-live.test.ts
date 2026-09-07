import { afterAll, describe, expect, it, vi } from "vitest";

import {
  BANDS,
  bandRank,
  type ScoringProfile,
} from "@/features/scoring/rubric";
import type { Listing } from "@/features/search/adzuna";
import { isFailure } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

import type { CookieJar } from "../helpers/cookie-jar";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { liveModelCallsEnabled } from "../helpers/model-client";
import { mintSession } from "../helpers/session";

/**
 * Spec 0015's two Value sourcing rows that a browser step could never hold
 * still (`verify.md`, lines 72 and 76).
 *
 * Both were written as manual checks and both are really cross account or
 * paired comparisons, which is what every other isolation proof in this
 * repository already does with two real minted sessions and direct calls
 * (`test/integration/profile-form.test.ts`,
 * `test/integration/application-actions.test.ts`). A person clicking through
 * two browser profiles proves the same thing once, on the day they did it.
 *
 * WHY `next/headers` IS STUBBED, AND ONLY THAT. `readScoringProfile()` calls
 * `readOwnProfile()`, which calls `createClient()` with no argument by design,
 * so it reads the real request's cookie store and `cookies()` throws outside a
 * request scope. The stub supplies a cookie store and nothing else: the
 * sessions are real, the policies are real, the rows are real. Same boundary
 * and same reasoning as `test/integration/profile-read.test.ts`, which
 * established this pattern.
 *
 * ONLY THE SECOND BLOCK SPENDS MONEY, and only it is gated. The isolation
 * block below makes no vendor call whatsoever: it reads the database and
 * nothing else, so gating it behind `TEST_LIVE_MODEL_CALLS_ENABLED` would
 * retire a free, fast, deterministic check on a security adjacent property to
 * a flag almost nobody sets. It runs on every `pnpm test:integration`.
 */

const requestScope = vi.hoisted(() => ({
  jar: undefined as CookieJar | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      getAll: () => requestScope.jar?.getAll() ?? [],
      set: (name: string, value: string, options: Record<string, unknown>) => {
        requestScope.jar?.setAll?.([{ name, value, options }], {});
      },
    }),
}));

const { readScoringProfile } = await import("@/features/scoring/profile-gate");
const { scoreListing } = await import("@/features/scoring/score");

const mintedUserIds: string[] = [];

afterAll(async () => {
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

/**
 * A signed in account with a profile of its own, written through its OWN
 * client so every insert lands under the real policy rather than around it.
 *
 * Fresh users rather than the fixed pool, per spec 0004: the pool serves the
 * read only isolation proof and anything that writes takes its own user.
 */
async function accountWithSkills(
  prefix: string,
  fullName: string,
  skills: readonly string[],
) {
  const user = await mintFixtureUser(prefix);
  mintedUserIds.push(user.id);

  const session = await mintSession(user.email);
  const client = await createClient(session.jar);

  const { error: profileError } = await client
    .from("profile")
    .insert({ id: user.id, full_name: fullName });
  expect(profileError).toBeNull();

  const { error: skillsError } = await client
    .from("profile_skill")
    .insert(skills.map((name) => ({ profile_id: user.id, name })));
  expect(skillsError).toBeNull();

  return { ...user, jar: session.jar };
}

describe("readScoringProfile() scores the caller's own profile and no one else's", () => {
  it("resolves each account to its own skills, never the other account's", async () => {
    /**
     * `verify.md` line 72. `readScoringProfile()` TAKES NO ARGUMENTS: it reads
     * whoever is currently authenticated, so there is no id a caller could pass
     * wrongly and no filter for a test to check. The only way this can be wrong
     * is if the composition leaks, and the only way to see that is to run it
     * twice under two different real sessions and compare.
     *
     * Spec 0010 already proves `readOwnProfile()` isolates. What is unproven,
     * and what this holds, is the composition SPECIFICALLY FOR SCORING: the
     * profile that ends up in a prompt is the caller's own.
     */
    const ada = await accountWithSkills("scoring-iso-ada", "Ada Fixture", [
      "Rust",
      "Kafka",
    ]);
    const grace = await accountWithSkills(
      "scoring-iso-grace",
      "Grace Fixture",
      ["Swift", "SwiftUI"],
    );

    requestScope.jar = ada.jar;
    const adaOutcome = await readScoringProfile();

    requestScope.jar = grace.jar;
    const graceOutcome = await readScoringProfile();

    if (adaOutcome.kind !== "score" || graceOutcome.kind !== "score") {
      throw new Error(
        `Expected both accounts to be scoreable, got ${adaOutcome.kind} and ${graceOutcome.kind}.`,
      );
    }

    expect([...adaOutcome.profile.skills].sort()).toEqual(["Kafka", "Rust"]);
    expect([...graceOutcome.profile.skills].sort()).toEqual([
      "Swift",
      "SwiftUI",
    ]);

    /**
     * THE ASSERTION THAT ACTUALLY CATCHES A LEAK. Checking each account got its
     * own skills passes even if the second read returned BOTH accounts' rows,
     * so each is also checked for the absence of the other's.
     */
    for (const name of ["Swift", "SwiftUI"]) {
      expect(adaOutcome.profile.skills).not.toContain(name);
    }
    for (const name of ["Rust", "Kafka"]) {
      expect(graceOutcome.profile.skills).not.toContain(name);
    }
  });
});

/** The same posting for both calls below, so the only variable is preferences. */
const listing: Listing = {
  source: "adzuna",
  sourceJobId: "prefs-fixture-1",
  title: "Senior Backend Engineer, Payments",
  companyName: "Contoso",
  location: "Berlin",
  url: "https://www.adzuna.com/land/ad/prefs-fixture-1",
  descriptionSnippet:
    "Senior backend engineer for our payments platform, on site in our Berlin office five days a week. You will work in Go against PostgreSQL, ship services onto Kubernetes, and own reliability for a system that moves real money. Experience with gRPC is valued. Salary 55,000 EUR.",
  salaryMin: 55_000,
  salaryMax: 55_000,
  salaryCurrency: "EUR",
  salaryIsPredicted: false,
  postedAt: undefined,
};

/** Skills and history that line up with that posting about as well as they can. */
const baseProfile: ScoringProfile = {
  summary:
    "Backend engineer, ten years, mostly distributed systems and payments.",
  skills: ["Go", "PostgreSQL", "Kubernetes", "gRPC", "Terraform"],
  experience: [
    {
      title: "Senior Backend Engineer",
      company: "Northwind Labs",
      startedOn: "2019-03-01",
      endedOn: undefined,
      description:
        "Owned the payments service: Go, PostgreSQL, gRPC, deployed on Kubernetes.",
    },
  ],
  preferences: undefined,
};

/**
 * The same person, whose stated preferences the posting flatly fails: it is on
 * site when they want remote, and it pays a fraction of their stated minimum.
 */
const clashingProfile: ScoringProfile = {
  ...baseProfile,
  preferences: {
    desired_titles: ["Principal Engineer"],
    desired_locations: ["Lisbon"],
    remote_preference: "remote",
    minimum_pay: 250_000,
    minimum_pay_currency: "EUR",
  },
};

describe.skipIf(!liveModelCallsEnabled())(
  "stated preferences never move the band (spec 0015, key invariant)",
  () => {
    it("bands the same posting no lower for a profile whose preferences it fails", async () => {
      /**
       * `verify.md` line 76, and the pair `rubric.ts` says does not exist yet.
       *
       * WHY THIS NEEDS A REAL VENDOR. The rule is enforced by ONE SENTENCE OF
       * INSTRUCTION and nothing else: `SCORING_SYSTEM_PROMPT` tells the model
       * preferences are context and must never move the band, and nothing in
       * the schema, the parse or the filter can stop it doing so anyway.
       * `rubric.ts` says as much in terms, and spec 0015's Follow-up asks
       * feature 16's harness for a case that could catch it happening. A test
       * with a stubbed vendor would assert that a fake answer came back
       * unchanged, which is the mock encoding the same assumption as the code
       * that `AGENTS.md` forbids. Only a real call can fail this.
       *
       * A PAIRED COMPARISON, NOT A SINGLE READING. Asserting one call comes
       * back strong proves the listing is a good match, not that preferences
       * were ignored. The two calls differ in exactly one field.
       *
       * NOT A REPLACEMENT FOR FEATURE 16's HARNESS. This is one pair on one
       * posting against a nondeterministic model. It can catch a preference
       * mismatch dragging a band down; it cannot measure how often that
       * happens, which is what the ground truth set is for.
       */
      const user = await mintFixtureUser("scoring-prefs");
      mintedUserIds.push(user.id);
      const session = await mintSession(user.email);

      const [neutral, clashing] = await Promise.all([
        scoreListing(baseProfile, listing, session.jar),
        scoreListing(clashingProfile, listing, session.jar),
      ]);

      if (isFailure(neutral) || isFailure(clashing)) {
        throw new Error("Expected two decisions, got a failure.");
      }

      if (!neutral.value.allowed || !clashing.value.allowed) {
        throw new Error("Expected both calls to be allowed by the gate.");
      }

      const neutralBand = neutral.value.value.band;
      const clashingBand = clashing.value.value.band;

      expect(BANDS).toContain(neutralBand);
      expect(BANDS).toContain(clashingBand);

      /**
       * THE VACUITY GUARD, and it has to come first. Two `not_a_match` bands
       * would satisfy the comparison below while proving nothing at all, so
       * the skills alignment is required to have registered before the
       * comparison means anything. `bandRank` is lower is better, so `<= 1` is
       * `good_match` or `strong_match`.
       */
      expect(bandRank(neutralBand)).toBeLessThanOrEqual(1);

      /**
       * The rule itself: failing every stated preference never costs a band.
       * Written as "no worse" rather than "identical" because the model is
       * nondeterministic and two calls can legitimately differ; a preference
       * mismatch DRAGGING the band down is the failure this exists to catch,
       * and that is directional.
       */
      expect(bandRank(clashingBand)).toBeLessThanOrEqual(bandRank(neutralBand));
    });
  },
);
