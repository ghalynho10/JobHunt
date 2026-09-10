import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { checkFitScore } from "@/features/scoring/check";
import type { Listing } from "@/features/search/adzuna";
import { TIERS, resolvedModel } from "@/lib/ai/tiers";
import { isFailure } from "@/lib/result";

import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { liveModelCallsEnabled } from "../helpers/model-client";
import { mintSession } from "../helpers/session";

/**
 * Spec 0019, "Critical test scenarios", happy path, and the ONLY source of
 * AC-6's timeout figure.
 *
 * Gated behind `TEST_LIVE_MODEL_CALLS_ENABLED` (`test/helpers/model-client.ts`),
 * unset by default, so a plain `pnpm test:integration` run never spends real
 * vendor money. Run explicitly with:
 *
 *   TEST_LIVE_MODEL_CALLS_ENABLED=true pnpm test:integration -t "ai_check latency"
 *
 * THE FILTER IS `"ai_check latency"` AND THE PRECISION IS LOAD BEARING. Spec
 * 0015's own live file documents `-t "real vendor"`, and that string appears
 * in THREE describe blocks: `fit-scoring-live.test.ts` (two OpenAI calls),
 * `model-client-router-live.test.ts` (one call per vendor), and this one. Run
 * that way, this measurement would spend `ai_scoring` budget it has no use
 * for and print its latencies interleaved with another vendor's. `-t
 * "ai_check"` is not tight enough either: it also selects the router file's
 * own single call `ai_check` case. The phrase below appears in this file and
 * nowhere else in the repository.
 *
 * `.env.test` HOLDS PLACEHOLDER VENDOR KEYS AND THE FLAG ALONE IS NOT ENOUGH.
 * The integration projects load that file rather than `.env.local`, so a run
 * without real keys in place reaches no vendor and fails every case with
 * `external_service_failed` on a perfectly valid key and model id. Spec 0015's
 * `verify.md` records the same trap for the scoring side.
 *
 * WHAT ONLY A LIVE CALL CAN PROVE, and why this file earns its cost. Every
 * rule in `check.ts` is a pure function and is proved without a vendor in
 * `src/features/scoring/check.test.ts`. What cannot be checked that way is
 * whether the schema this feature sends is one GOOGLE's structured output mode
 * accepts, which is a different vendor from the one spec 0015's live test
 * exercised, and how long that vendor actually takes. AC-6 requires the
 * `ai_check` timeout to be DERIVED FROM A REAL MEASUREMENT rather than
 * guessed, and this is where the measurement comes from.
 *
 * IT ASSERTS NOTHING ABOUT WHICH SKILLS COME BACK, deliberately. One posting
 * against one claim list says nothing about whether the check discriminates,
 * and asserting a specific verdict here would be an eval written as a unit
 * test: flaky, and evidence for nothing. What is asserted is the contract:
 * the answer parses, and every name in it was one of the names sent.
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

const listing: Listing = {
  source: "adzuna",
  sourceJobId: "live-check-fixture-1",
  title: "Senior Backend Engineer, Payments",
  companyName: "Contoso",
  location: "Berlin",
  url: "https://www.adzuna.com/land/ad/live-check-fixture-1",
  descriptionSnippet:
    "We are hiring a senior backend engineer for our payments platform. You will work in Go against PostgreSQL, ship services onto Kubernetes, and own reliability for a system that moves real money. Experience with gRPC is valued…",
  salaryMin: undefined,
  salaryMax: undefined,
  salaryCurrency: undefined,
  salaryIsPredicted: false,
  postedAt: undefined,
};

/**
 * AC-6's sample size. Five is the floor the criterion names, and it is the
 * floor rather than a target: this is a handful of calls, not a distribution,
 * which spec 0019's Consequences records as a known limit of the resulting
 * number rather than hiding it.
 */
const LATENCY_SAMPLES = 5;

/**
 * This test's own timeout, DERIVED rather than picked, and it must exist
 * (found by a Fable 5.1 review on 2026-09-09).
 *
 * The `integration` project's default is 30000ms (`vitest.config.mts`), sized
 * for tests that talk to a local database. This one awaits
 * `LATENCY_SAMPLES` vendor calls ONE AFTER ANOTHER, and each may legitimately
 * run to `ai_check`'s own ceiling, so the real worst case is five times that
 * ceiling, not thirty seconds. A slow but entirely healthy vendor day would
 * therefore have failed this test on the clock, AFTER spending every one of
 * its real calls: the money goes out and the measurement never comes back.
 *
 * IT READS `TIERS.ai_check.timeoutMs` RATHER THAN HARDCODING 20000, so
 * re-deriving that ceiling under AC-6 moves this with it. The added 30000 is
 * headroom for the fixture user mint and the session exchange, which happen
 * before the first call.
 */
const TEST_TIMEOUT_MS = LATENCY_SAMPLES * TIERS.ai_check.timeoutMs + 30_000;

/** AC-6's derivation: slowest x 3, rounded up to 5s, clamped 15s to 30s. */
export function deriveTimeoutMs(latenciesMs: readonly number[]): number {
  const slowest = Math.max(...latenciesMs);
  const tripled = slowest * 3;
  const rounded = Math.ceil(tripled / 5_000) * 5_000;

  return Math.min(Math.max(rounded, 15_000), 30_000);
}

describe.skipIf(!liveModelCallsEnabled())(
  "checkFitScore() ai_check latency measurement (covers AC-1, AC-2, AC-6)",
  () => {
    it(
      `returns a parsed verdict and measures ${LATENCY_SAMPLES} real latencies`,
      async () => {
        const checkModel = resolvedModel(TIERS.ai_check.model);
        const scoringModel = resolvedModel(TIERS.ai_scoring.model);
        const session = await freshSession("check-live-latency");
        const latencies: number[] = [];

        const artifact = join(
          import.meta.dirname,
          ".output",
          "ai-check-latency.json",
        );

        /**
         * SAVES WHAT HAS BEEN MEASURED SO FAR, called after EVERY call rather
         * than once at the end.
         *
         * THIS IS THE SAME LESSON AS THE `console.log` LOSS, APPLIED PROPERLY
         * THIS TIME. The first version of this test printed its measurement
         * through `console.log`, which this project's integration runs do not
         * surface, so a completed five call run threw its whole deliverable
         * away. The fix wrote a file instead, but still wrote it AFTER the
         * loop, which left the identical hole one step further along: a vendor
         * error or a timeout on call four discards the three real latencies
         * already paid for, and the only way back to them is to spend the money
         * again. Partial data from a paid run is worth strictly more than
         * nothing, so it is on disk before the next call is made.
         */
        const save = () => {
          mkdirSync(dirname(artifact), { recursive: true });
          writeFileSync(
            artifact,
            `${JSON.stringify(
              {
                measuredAt: new Date().toISOString(),
                complete: latencies.length === LATENCY_SAMPLES,
                samplesTaken: latencies.length,
                samplesExpected: LATENCY_SAMPLES,
                checkProvider: checkModel.provider,
                checkModelId: checkModel.modelId,
                scoringProvider: scoringModel.provider,
                scoringModelId: scoringModel.modelId,
                latenciesMs: latencies,
                ...(latencies.length === LATENCY_SAMPLES
                  ? {
                      slowestMs: Math.max(...latencies),
                      derivedTimeoutMs: deriveTimeoutMs(latencies),
                    }
                  : {}),
              },
              undefined,
              2,
            )}\n`,
          );
        };

        for (let attempt = 0; attempt < LATENCY_SAMPLES; attempt += 1) {
          const startedAt = Date.now();

          const result = await checkFitScore(
            listing,
            ["Go", "PostgreSQL", "Kubernetes", "Terraform"],
            session.jar,
          );

          latencies.push(Date.now() - startedAt);

          /** On disk before the next call is made, never after the loop. */
          save();

          if (isFailure(result)) {
            throw new Error(
              `Expected a verdict, got a failure: ${result.kind}.`,
            );
          }

          if (!result.value.allowed) {
            throw new Error(
              `Expected the call to be allowed, was refused: ${result.value.reason}.`,
            );
          }

          /**
           * AC-3 against a real model rather than a constructed answer: every
           * name that comes back was one of the names sent. A name this filter
           * let through would remove a chip from somebody's card over a dispute
           * no vendor actually raised.
           */
          for (const skill of result.value.value.ungroundedSkills) {
            expect(["Go", "PostgreSQL", "Kubernetes", "Terraform"]).toContain(
              skill,
            );
          }
        }

        /**
         * THE MEASUREMENT IS THE POINT OF THIS TEST, so it is printed rather
         * than only asserted. AC-6 asks for the observed figures and the
         * derived value to be recorded in spec 0019's Follow-up, and this is
         * where a person running the test reads them off.
         *
         * IT NAMES THE VENDOR AND MODEL EACH CALL ACTUALLY WENT TO, read off
         * the resolved `TIERS` entry `callTier("ai_check", …)` hands to
         * `generateObject`, and it prints `ai_scoring`'s beside it. That is the
         * half a reader cannot otherwise confirm: a test filter that quietly
         * selected the wrong file would still print a plausible looking set of
         * latencies, and the resulting timeout would be derived from OpenAI.
         * The printed line carries its own proof of which vendor was measured
         * rather than asking anyone to trust the filter.
         */
        const line = [
          `ai_check via ${checkModel.provider}/${checkModel.modelId}`,
          `(ai_scoring is ${scoringModel.provider}/${scoringModel.modelId})`,
          `latencies (ms): ${latencies.join(", ")}`,
          `slowest ${Math.max(...latencies)}`,
          `derived timeoutMs ${deriveTimeoutMs(latencies)}`,
        ].join(" · ");

        /**
         * `process.stdout.write` AND A FILE, NEVER `console.log`, AND THIS IS A
         * CORRECTION RATHER THAN A STYLE CHOICE (2026-09-09).
         *
         * The first version of this test printed the line with `console.log`.
         * It never appeared. This project's integration runs do not surface
         * `console.log` to the reporter AT ALL, proved by a free probe on a
         * passing test that made no vendor call, and nothing in
         * `vitest.config.mts` or the setup files suppresses it deliberately. So
         * a paid five call run completed, passed, and threw its entire
         * deliverable away: the five real latencies AC-6 exists to capture were
         * gone the moment the process exited, and the only way back to them was
         * to spend the money again.
         *
         * THE FILE IS THE ACTUAL FIX, not the `stdout.write`. A stream can be
         * swallowed by a reporter, a pipe, or a `tail` that cuts the wrong end;
         * a measurement that cost real money should not depend on any of them
         * surviving. That file is written by `save()` above, after EVERY call
         * rather than here, so a failure partway keeps the latencies already
         * paid for; this line is the convenience copy for whoever is watching
         * the run, not the record.
         *
         * It lands in a gitignored directory, the same shape spec 0017 uses for
         * the eval harness's own reports (`/test/eval/.output/`).
         */
        process.stdout.write(`\n${line}\n`);

        expect(latencies).toHaveLength(LATENCY_SAMPLES);

        /**
         * THE `cross vendor` HALF OF THIS FEATURE'S NAME, asserted on the run
         * that produced the number rather than only in `tiers.test.ts`. If the
         * two tiers ever pointed at one vendor, the timeout derived here would
         * be honest and the feature it configures would be meaningless, and
         * nothing else in this file would notice.
         */
        expect(checkModel.provider.split(".")[0]).not.toBe(
          scoringModel.provider.split(".")[0],
        );
      },
      TEST_TIMEOUT_MS,
    );
  },
);

/**
 * AC-6's arithmetic, proved for free. The derivation is a rule the spec
 * states and this suite is the only thing that applies it, so a rounding or
 * clamping mistake would otherwise be invisible until it silently produced a
 * timeout nobody chose.
 */
describe("deriveTimeoutMs() (AC-6)", () => {
  it("triples the slowest sample and rounds up to the nearest 5 seconds", () => {
    expect(deriveTimeoutMs([1_000, 2_100, 1_500])).toBe(15_000);
    expect(deriveTimeoutMs([6_000, 3_000])).toBe(20_000);
    expect(deriveTimeoutMs([7_100])).toBe(25_000);
  });

  it("clamps to the 15 second floor and the 30 second ceiling", () => {
    /** A fast vendor cannot drive the timeout below a survivable floor. */
    expect(deriveTimeoutMs([200, 300])).toBe(15_000);

    /** A slow one cannot push it past `ai_scoring`'s own 30 seconds. */
    expect(deriveTimeoutMs([20_000])).toBe(30_000);
  });
});
