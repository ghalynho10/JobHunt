import { afterAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { callTier } from "@/lib/ai/client";
import { isFailure } from "@/lib/result";

import { createCookieJar } from "../helpers/cookie-jar";
import { queryAsSuperuser } from "../helpers/database";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession } from "../helpers/session";

/**
 * Spec 0012: `callTier()` against the real local stack, proving the gate
 * actually reaches this router and that a refusal never dispatches a vendor
 * call.
 *
 * `generateObject` IS MOCKED HERE, deliberately, unlike `checkUsageGate()`'s
 * own integration suite. The gate's atomicity is a real database guarantee
 * this file does not re-prove (`test/integration/usage-gating.test.ts`
 * already does); what THIS file proves is `callTier()`'s own composition,
 * that a refusal short circuits before `generateObject` is ever reached.
 * Proving that against the real OpenAI and Google APIs would need real keys
 * and spend real money on every `pnpm test:integration` run, which is exactly
 * what `TEST_LIVE_MODEL_CALLS_ENABLED` (see the happy path below) exists to
 * gate instead. Mocking the vendor SDK boundary here does not encode the
 * assumption under test, which is the gate's own real refusal, not the
 * vendor's behaviour.
 */

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateObject: vi.fn() };
});

const { generateObject } = await import("ai");

const ROUTER_SCHEMA = z.object({ answer: z.string() });
const mintedUserIds: string[] = [];

async function freshSession(prefix: string) {
  const user = await mintFixtureUser(prefix);
  mintedUserIds.push(user.id);
  return mintSession(user.email);
}

afterAll(async () => {
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

describe("a zeroed usage_cap refuses every call to a tier without reaching the vendor (AC-4, AC-8)", () => {
  it("returns success({ allowed: false, reason }) for ai_scoring and never calls generateObject", async () => {
    await queryAsSuperuser(
      `update public.usage_cap set cap_value = 0
        where call_type = 'ai_scoring'`,
    );

    try {
      const session = await freshSession("router-zero-cap");
      vi.mocked(generateObject).mockClear();

      const result = await callTier(
        "ai_scoring",
        ROUTER_SCHEMA,
        "irrelevant prompt",
        { cookieAdapter: session.jar },
      );

      if (isFailure(result)) {
        throw new Error(`Expected a decision, got a failure: ${result.kind}.`);
      }

      expect(result.value.allowed).toBe(false);
      expect(generateObject).not.toHaveBeenCalled();
    } finally {
      await queryAsSuperuser(
        `update public.usage_cap set cap_value = case
            when scope = 'account' and period = 'week' then 500
            when scope = 'global' and period = 'day' then 1320
            when scope = 'global' and period = 'month' then 40000
          end
          where call_type = 'ai_scoring'`,
      );
    }
  });
});

describe("no session, no vendor call (AC-4)", () => {
  it("returns session_missing before generateObject is ever reached", async () => {
    vi.mocked(generateObject).mockClear();

    const result = await callTier(
      "ai_check",
      ROUTER_SCHEMA,
      "irrelevant prompt",
      { cookieAdapter: createCookieJar() },
    );

    if (!isFailure(result)) {
      throw new Error("Expected session_missing, got a decision.");
    }

    expect(result.kind).toBe("session_missing");
    expect(generateObject).not.toHaveBeenCalled();
  });
});
