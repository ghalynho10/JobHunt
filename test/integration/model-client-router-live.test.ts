import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { callTier } from "@/lib/ai/client";
import { isFailure } from "@/lib/result";

import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { liveModelCallsEnabled } from "../helpers/model-client";
import { mintSession } from "../helpers/session";

/**
 * Spec 0012, "Critical test scenarios", happy path: calling each tier
 * against a REAL vendor. Gated behind `TEST_LIVE_MODEL_CALLS_ENABLED`
 * (`test/helpers/model-client.ts`, mirroring `TEST_DIRECT_DB_ENABLED`'s own
 * pattern), unset by default, so a plain `pnpm test:integration` run never
 * spends real vendor money. Run explicitly with:
 *
 *   TEST_LIVE_MODEL_CALLS_ENABLED=true pnpm test:integration -t "real vendor"
 *
 * Real `OPENAI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` values must be in
 * `.env.test` for this to do anything but fail.
 *
 * AC-1's "two tiers resolve to two different vendor packages" is proven
 * statically in `src/lib/ai/tiers.test.ts`, by reading `tiers.ts`'s own map;
 * `callTier()`'s return value carries only the caller's parsed object (AC-2),
 * never provider metadata, so there is nothing to re-assert about vendor
 * identity from out here. What this file proves instead is that the real
 * wiring, the key, the model id, and the schema shape, actually round trips
 * against each real vendor.
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

const ANSWER_SCHEMA = z.object({
  answer: z.string().describe("Exactly the word 'ok', nothing else."),
});

describe.skipIf(!liveModelCallsEnabled())(
  "callTier() against a real vendor (covers AC-1, AC-2)",
  () => {
    it("ai_scoring (OpenAI) returns a value matching the caller's schema", async () => {
      const session = await freshSession("router-live-scoring");

      const result = await callTier(
        "ai_scoring",
        ANSWER_SCHEMA,
        "Reply with exactly the word 'ok' in the answer field.",
        { cookieAdapter: session.jar },
      );

      if (isFailure(result)) {
        throw new Error(`Expected a decision, got a failure: ${result.kind}.`);
      }

      if (!result.value.allowed) {
        throw new Error(
          `Expected the call to be allowed, was refused: ${result.value.reason}.`,
        );
      }

      expect(ANSWER_SCHEMA.safeParse(result.value.value).success).toBe(true);
    });

    it("ai_check (Google) returns a value matching the caller's schema", async () => {
      const session = await freshSession("router-live-check");

      const result = await callTier(
        "ai_check",
        ANSWER_SCHEMA,
        "Reply with exactly the word 'ok' in the answer field.",
        { cookieAdapter: session.jar },
      );

      if (isFailure(result)) {
        throw new Error(`Expected a decision, got a failure: ${result.kind}.`);
      }

      if (!result.value.allowed) {
        throw new Error(
          `Expected the call to be allowed, was refused: ${result.value.reason}.`,
        );
      }

      expect(ANSWER_SCHEMA.safeParse(result.value.value).success).toBe(true);
    });
  },
);
