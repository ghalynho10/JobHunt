import type { FailureKind, FailureSeverity } from "@/lib/result";

/**
 * `callTier()`'s two vendor call failure kinds (spec 0012, AC-5, AC-6). A
 * gate refusal is never one of these: it is `success({ allowed: false,
 * reason })`, unchanged from `checkUsageGate()`'s own AC-5 shape. These two
 * are the "the vendor call itself broke" case instead.
 *
 * NAMED THE SAME WAY `USAGE_GATE_FAILURES` FIXES KIND AND SEVERITY PER
 * SITUATION, so no call site picks a severity in the moment.
 */
interface AiRouterFailureShape {
  readonly kind: FailureKind;
  readonly severity: FailureSeverity;
  /** Safe to show a user. Never the vendor's own raw error text. */
  readonly message: string;
}

export const AI_ROUTER_FAILURES = {
  /**
   * The vendor's answer did not validate against the caller's schema.
   * `classify()` in `client.ts` reaches this branch on
   * `NoObjectGeneratedError.isInstance(error)`. No repair attempt, no retry.
   */
  response_malformed: {
    kind: "response_malformed",
    severity: "unexpected",
    message: "The model's answer didn't come back in the shape we expected.",
  },
  /**
   * The provider call threw or timed out for any other reason: a network
   * fault, a timeout, an API error. `classify()` reaches this branch for
   * anything that is not a schema mismatch.
   */
  external_service_failed: {
    kind: "external_service_failed",
    severity: "unexpected",
    message:
      "We couldn't reach the model provider just now. Try again in a few minutes.",
  },
} as const satisfies Readonly<Record<string, AiRouterFailureShape>>;
