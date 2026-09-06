import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { callTier } from "@/lib/ai/client";
import { isFailure } from "@/lib/result";

import { createCookieJar } from "../helpers/cookie-jar";

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
 * what `TEST_LIVE_MODEL_CALLS_ENABLED` (see `model-client-router-live.test.ts`)
 * exists to gate instead. Mocking the vendor SDK boundary here does not
 * encode the assumption under test, which is the gate's own real refusal,
 * not the vendor's behaviour.
 *
 * THE ZEROED-CAP SCENARIO LIVES IN `test/integration-serial/` INSTEAD,
 * moved there 2026-09-06 by `/check review`: it mutates the shared, shipped
 * `ai_scoring` usage_cap rows, which races any other file in this project
 * that also calls `ai_scoring` (`model-client-router-live.test.ts`'s own
 * live vendor test). This file's own scenario below touches no shared state
 * and needs no session at all, so it stays here, parallel safe.
 */

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateObject: vi.fn() };
});

const { generateObject } = await import("ai");

const ROUTER_SCHEMA = z.object({ answer: z.string() });

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
