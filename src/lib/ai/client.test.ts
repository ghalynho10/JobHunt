import { NoObjectGeneratedError } from "ai";
import { describe, expect, it } from "vitest";

import { classify } from "./client";

/**
 * Spec 0012, key invariant: `generateObject` throws one error type whether
 * the vendor call itself failed or its answer did not match the schema, so
 * `classify()` reads the caught error with a pure function before exactly
 * one `failure()` call follows. No vendor call is needed to exercise either
 * branch (spec 0012, "Critical test scenarios").
 */
describe("classify() (covers AC-5, AC-6)", () => {
  it("reads a NoObjectGeneratedError as response_malformed", () => {
    const error = new NoObjectGeneratedError({
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
        outputTokenDetails: {
          textTokens: 5,
          reasoningTokens: undefined,
        },
        totalTokens: 15,
      },
      finishReason: "stop",
    });

    expect(classify(error)).toBe("response_malformed");
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
