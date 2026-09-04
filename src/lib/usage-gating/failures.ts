import type { FailureKind, FailureSeverity } from "@/lib/result";

/**
 * `checkUsageGate()`'s three non refusal failure kinds (spec 0011, API surface
 * table). AC-5: an ordinary refusal (a cap reached, the kill switch engaged or
 * unavailable) is never one of these, it is `success({ allowed: false, reason
 * })`. These three are the "something is broken" case instead.
 *
 * NAMED THE SAME WAY `PROFILE_FAILURES` FIXES KIND AND SEVERITY PER SITUATION,
 * so no call site picks a severity in the moment.
 */
interface UsageGateFailureShape {
  readonly kind: FailureKind;
  readonly severity: FailureSeverity;
  /** Safe to show a user by the `Failure` contract. */
  readonly message: string;
}

export const USAGE_GATE_FAILURES = {
  /** No valid session. AC-13: checked with `getClaims()`, never `getSession()`. */
  session_missing: {
    kind: "session_missing",
    severity: "expected",
    message: "Sign in again to keep searching.",
  },
  /**
   * The driver threw, the RPC returned an `error`, or it returned neither an
   * `error` nor a row (AC-14: that last case is fail closed too, never an
   * absent, harmless decision).
   */
  database_unavailable: {
    kind: "database_unavailable",
    severity: "unexpected",
    message: "Could not reach the database to check the usage gate.",
  },
  /**
   * AC-6: `call_type` is unrecognised, or missing one of its three required
   * `usage_cap` rows. `check_usage_gate` reports this as `configured: false`,
   * an ordinary output column, never a raised exception.
   */
  usage_gate_misconfigured: {
    kind: "usage_gate_misconfigured",
    severity: "unexpected",
    message: "This call type has no usage cap configured.",
  },
} as const satisfies Readonly<Record<string, UsageGateFailureShape>>;
