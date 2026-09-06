import { afterAll, describe, expect, it } from "vitest";

import { BANDS, SPONSORSHIP_SIGNALS } from "@/features/scoring/rubric";
import type { ScoringProfile } from "@/features/scoring/rubric";
import { scoreListing } from "@/features/scoring/score";
import type { Listing } from "@/features/search/adzuna";
import { isFailure } from "@/lib/result";

import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { liveModelCallsEnabled } from "../helpers/model-client";
import { mintSession } from "../helpers/session";

/**
 * Spec 0015, "Critical test scenarios", happy path: scoring a real listing
 * against a real profile with a real vendor.
 *
 * Gated behind `TEST_LIVE_MODEL_CALLS_ENABLED` (`test/helpers/model-client.ts`),
 * unset by default, so a plain `pnpm test:integration` run never spends real
 * vendor money. Run explicitly with:
 *
 *   TEST_LIVE_MODEL_CALLS_ENABLED=true pnpm test:integration -t "real vendor"
 *
 * WHAT ONLY A LIVE CALL CAN PROVE, and why this file earns its cost. Every
 * other rule in this feature is a pure function and is tested without a vendor
 * in `src/features/scoring/rubric.test.ts`. What cannot be checked that way is
 * whether the schema this feature actually sends is one OpenAI's structured
 * output mode will accept, and whether the model returns a band from the five
 * rather than something adjacent. `rubric.ts` deliberately keeps every length
 * and size constraint OUT of the wire schema for exactly that reason; this is
 * the test that would catch that reasoning being wrong.
 *
 * WHAT IT DELIBERATELY DOES NOT ASSERT is which band comes back. One listing
 * against one profile says nothing about whether the five bands discriminate,
 * and asserting a specific band here would be an eval written as a unit test:
 * flaky, and evidence for nothing. That is AC-2, and spec 0015 defers it to
 * feature 16's harness against feature 15's ground truth set.
 */

const mintedUserIds: string[] = [];

async function freshSession(prefix: string) {
  const user = await mintFixtureUser(prefix);
  mintedUserIds.push(user.id);
  return mintSession(user.email);
}

afterAll(async () => {
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

const profile: ScoringProfile = {
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

const listing: Listing = {
  source: "adzuna",
  sourceJobId: "live-fixture-1",
  title: "Senior Backend Engineer, Payments",
  companyName: "Contoso",
  location: "Berlin",
  url: "https://www.adzuna.com/land/ad/live-fixture-1",
  descriptionSnippet:
    "We are hiring a senior backend engineer for our payments platform. You will work in Go against PostgreSQL, ship services onto Kubernetes, and own reliability for a system that moves real money. Experience with gRPC is valued…",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryCurrency: undefined,
  salaryIsPredicted: false,
  postedAt: undefined,
};

describe.skipIf(!liveModelCallsEnabled())(
  "scoreListing() against a real vendor (covers AC-1, AC-3, AC-5, AC-6)",
  () => {
    it("returns a parsed score whose band is one of the five", async () => {
      const session = await freshSession("scoring-live-band");

      const result = await scoreListing(profile, listing, session.jar);

      if (isFailure(result)) {
        throw new Error(`Expected a decision, got a failure: ${result.kind}.`);
      }

      if (!result.value.allowed) {
        throw new Error(
          `Expected the call to be allowed, was refused: ${result.value.reason}.`,
        );
      }

      const score = result.value.value;

      /** AC-1: the band is one of the five, never a number and never a sixth. */
      expect(BANDS).toContain(score.band);

      /** AC-6: the signal is required, and is one of the three. */
      expect(SPONSORSHIP_SIGNALS).toContain(score.sponsorshipSignal);

      /** The written reasoning exists and is within its documented cap. */
      expect(score.reasoning.length).toBeGreaterThan(0);
      expect(score.reasoning.length).toBeLessThanOrEqual(600);
    });

    it("never names a skill the caller does not have (AC-5)", async () => {
      /**
       * The post-parse filter, proved against a real model rather than a
       * constructed answer. A hallucinated skill is dropped rather than
       * displayed, because a skill on the reader's own card under their own
       * name that they never claimed is the one output this feature must never
       * produce.
       */
      const session = await freshSession("scoring-live-skills");

      const result = await scoreListing(profile, listing, session.jar);

      if (isFailure(result) || !result.value.allowed) {
        throw new Error("Expected an allowed score.");
      }

      const own = new Set(profile.skills);
      const named = [
        ...result.value.value.matchedSkills,
        ...result.value.value.notMentionedSkills,
      ];

      for (const skill of named) expect(own).toContain(skill);
    });
  },
);
