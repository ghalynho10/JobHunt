import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { isFailure } from "@/lib/result";

/**
 * `getActiveSpan` alone is replaced, not the whole module: `Sentry.startSpan`
 * stays real, so `callTier()`'s own span still opens and closes for real in
 * every other test in this file. `vi.spyOn` cannot touch it directly (an ESM
 * named export's binding is not configurable), which is why this is a
 * `vi.mock` rather than a spy on the imported namespace.
 */
const getActiveSpan = vi.hoisted(() => vi.fn());

vi.mock("@sentry/nextjs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sentry/nextjs")>();
  /**
   * A `Proxy` over `actual`, not an object spread: `@sentry/nextjs`'s real
   * module exports at least one property (`withScope`) that a plain
   * `{ ...actual, getActiveSpan }` silently drops, confirmed 2026-09-06 by
   * every test below failing with "No withScope export is defined on the
   * mock" the moment the spread form was tried. The `Proxy` forwards every
   * property read straight to the real module regardless of how it is
   * defined, and only intercepts the one export this file needs to replace.
   */
  return new Proxy(actual, {
    get(target, prop, receiver) {
      if (prop === "getActiveSpan") return getActiveSpan;
      return Reflect.get(target, prop, receiver);
    },
  });
});

/**
 * `withUsageGate` is replaced at the module boundary, the same seam
 * `with-usage-gate.test.ts` itself proves correct in isolation: it always
 * invokes its `fn` thunk and wraps a success as `{ allowed: true, value }`,
 * which is what lets these tests exercise `callTier()`'s own vendor call
 * wiring without a real session or a real database. `withUsageGate()`'s own
 * refusal/gate branching is proved for real in
 * `test/integration/model-client-router.test.ts` against the real local
 * stack; re-mocking it here would just restate that same assumption rather
 * than test anything new.
 */
interface FakeResult {
  readonly ok: boolean;
  readonly value?: unknown;
}

const withUsageGate = vi.hoisted(() =>
  vi.fn(async (_tier: string, fn: () => Promise<FakeResult>) => {
    const result = await fn();
    if (!result.ok) return result;
    return { ok: true, value: { allowed: true, value: result.value } };
  }),
);

vi.mock("@/lib/usage-gating/with-usage-gate", () => ({ withUsageGate }));

const generateObject = vi.hoisted(() => vi.fn());

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateObject };
});

const { callTier, classify } = await import("./client");
const { NoObjectGeneratedError } = await import("ai");
const { AI_ROUTER_FAILURES } = await import("./failures");

const SCHEMA = z.object({ answer: z.string() });

beforeEach(() => {
  vi.clearAllMocks();
});

function noObjectGeneratedError(finishReason: "stop" | "length" = "stop") {
  return new NoObjectGeneratedError({
    message: "The model did not produce a parsable object.",
    response: { id: "resp-1", timestamp: new Date(0), modelId: "test" },
    usage: {
      inputTokens: 10,
      inputTokenDetails: {
        noCacheTokens: undefined,
        cacheReadTokens: undefined,
        cacheWriteTokens: undefined,
      },
      outputTokens: 5,
      outputTokenDetails: { textTokens: 5, reasoningTokens: undefined },
      totalTokens: 15,
    },
    finishReason,
  });
}

/**
 * Spec 0012, key invariant: `generateObject` throws one error type whether
 * the vendor call itself failed or its answer did not match the schema, so
 * `classify()` reads the caught error with a pure function before exactly
 * one `failure()` call follows. No vendor call is needed to exercise either
 * branch (spec 0012, "Critical test scenarios").
 */
describe("classify() (covers AC-5, AC-6)", () => {
  it("reads a NoObjectGeneratedError as response_malformed", () => {
    expect(classify(noObjectGeneratedError())).toBe("response_malformed");
  });

  it("reads any other thrown value as external_service_failed", () => {
    expect(classify(new Error("network reset"))).toBe(
      "external_service_failed",
    );
    expect(classify("not even an Error instance")).toBe(
      "external_service_failed",
    );
  });
});

/**
 * `callTier()`'s own composition: the gate allows, `generateObject` is
 * called with the tier's fixed configuration, and the result reaches the
 * caller as `{ allowed: true, value }` matching the schema.
 *
 * This closes a gap `/check verify` found on 2026-09-06: the only test that
 * previously exercised this path end to end was the gated, unrun live vendor
 * test, so a regression here would only ever be caught by a test that spends
 * real money. This one never reaches a vendor SDK network call.
 */
describe("callTier(): the allowed path (covers AC-2, AC-4)", () => {
  it("returns { allowed: true, value } matching the schema when the vendor call succeeds", async () => {
    generateObject.mockResolvedValueOnce({ object: { answer: "ok" } });

    const result = await callTier("ai_scoring", SCHEMA, "a prompt");

    expect(isFailure(result)).toBe(false);
    if (!isFailure(result)) {
      expect(result.value).toEqual({
        allowed: true,
        value: { answer: "ok" },
      });
    }
  });

  it("passes the tier and the cookie adapter through to withUsageGate", async () => {
    generateObject.mockResolvedValueOnce({ object: { answer: "ok" } });
    const jar = { getAll: () => [], setAll: () => {} };

    await callTier("ai_check", SCHEMA, "a prompt", { cookieAdapter: jar });

    expect(withUsageGate).toHaveBeenCalledWith(
      "ai_check",
      expect.any(Function),
      jar,
    );
  });

  it("passes the caller's system content and prompt through to generateObject", async () => {
    generateObject.mockResolvedValueOnce({ object: { answer: "ok" } });

    await callTier("ai_scoring", SCHEMA, "score this listing", {
      system: "You are a fair judge.",
    });

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "score this listing",
        system: "You are a fair judge.",
      }),
    );
  });
});

/**
 * `callTier()`'s own failure wiring: a caught vendor error is classified,
 * then reaches the caller as a `Failure` carrying `AI_ROUTER_FAILURES`'s
 * fixed kind, severity and message for that classification, never the
 * vendor's own raw error text (spec 0012, AC-5, AC-6, and the Value sourcing
 * table's "a provider failure's message" row). `classify()`'s own unit tests
 * above prove the classification; these prove the lookup and the `Failure`
 * it produces.
 */
describe("callTier(): the failure path (covers AC-5, AC-6)", () => {
  it("returns response_malformed with the fixed message for a schema mismatch", async () => {
    generateObject.mockRejectedValueOnce(noObjectGeneratedError());

    const result = await callTier("ai_scoring", SCHEMA, "a prompt");

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.kind).toBe("response_malformed");
      expect(result.severity).toBe(
        AI_ROUTER_FAILURES.response_malformed.severity,
      );
      expect(result.message).toBe(
        AI_ROUTER_FAILURES.response_malformed.message,
      );
    }
  });

  it("returns external_service_failed with the fixed message for any other thrown error", async () => {
    generateObject.mockRejectedValueOnce(
      new Error(
        "connect ECONNREFUSED, and here is a stack trace nobody should see",
      ),
    );

    const result = await callTier("ai_check", SCHEMA, "a prompt");

    expect(isFailure(result)).toBe(true);
    if (isFailure(result)) {
      expect(result.kind).toBe("external_service_failed");
      expect(result.severity).toBe(
        AI_ROUTER_FAILURES.external_service_failed.severity,
      );
      /**
       * The vendor's own raw error text never reaches the caller (spec
       * 0012's Value sourcing table): only the fixed, non secret message
       * from `AI_ROUTER_FAILURES` is returned.
       */
      expect(result.message).toBe(
        AI_ROUTER_FAILURES.external_service_failed.message,
      );
      expect(result.message).not.toMatch(/ECONNREFUSED/);
    }
  });

  /**
   * A truncated response (the model ran out of room before finishing) throws
   * the same `NoObjectGeneratedError` class a genuine schema mismatch does,
   * with `finishReason: "length"` attached (spec 0012's rationale for
   * `ai_scoring`'s `maxOutputTokens: 2048`, a placeholder feature 14 may have
   * to raise). `classify()` still reads this as `response_malformed` on
   * purpose: this fix does not add a `FailureKind` for it, that is a spec
   * level decision. What it does add is a queryable span attribute, so a
   * truncation reads as a truncation in Sentry rather than as an ordinary
   * vendor schema failure.
   */
  it("marks a truncated response with a span attribute, but still classifies it as response_malformed (covers AC-6)", async () => {
    const fakeSpan = { setAttribute: vi.fn(), setStatus: vi.fn() };
    getActiveSpan.mockReturnValue(fakeSpan);

    try {
      generateObject.mockRejectedValueOnce(noObjectGeneratedError("length"));

      const result = await callTier("ai_scoring", SCHEMA, "a prompt");

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.kind).toBe("response_malformed");
        expect(result.message).toBe(
          AI_ROUTER_FAILURES.response_malformed.message,
        );
      }

      expect(fakeSpan.setAttribute).toHaveBeenCalledWith("stage", "vendor");
      expect(fakeSpan.setAttribute).toHaveBeenCalledWith("truncated", true);
    } finally {
      getActiveSpan.mockReturnValue(undefined);
    }
  });

  it("does not mark an ordinary schema mismatch as truncated", async () => {
    const fakeSpan = { setAttribute: vi.fn(), setStatus: vi.fn() };
    getActiveSpan.mockReturnValue(fakeSpan);

    try {
      generateObject.mockRejectedValueOnce(noObjectGeneratedError("stop"));

      await callTier("ai_scoring", SCHEMA, "a prompt");

      expect(fakeSpan.setAttribute).not.toHaveBeenCalledWith(
        "truncated",
        expect.anything(),
      );
    } finally {
      getActiveSpan.mockReturnValue(undefined);
    }
  });
});
