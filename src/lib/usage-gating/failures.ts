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
    /**
     * Corrected twice on 2026-09-04, both times a fresh model review. The
     * first pass stopped naming the database and "the usage gate", both
     * internal nouns. The second pass gave this its own sentence again: it
     * had been reworded to differ from `usage_gate_misconfigured` below by
     * one word, and had drifted to open with `copy.ts`'s `kill_switch_unavailable`
     * (`COPY-5`) verbatim, a distinct, deliberate refusal the gate produces
     * on purpose, not a failure. Three different operator responses need
     * three sentences a support conversation can actually tell apart.
     */
    message:
      "We couldn't check your search limit just now. Try again in a few minutes.",
  },
  /**
   * AC-6: `call_type` is unrecognised, or missing one of its three required
   * `usage_cap` rows. `check_usage_gate` reports this as `configured: false`,
   * an ordinary output column, never a raised exception.
   */
  usage_gate_misconfigured: {
    kind: "usage_gate_misconfigured",
    severity: "unexpected",
    /**
     * Corrected twice on 2026-09-04. Previously named "call type" and
     * "usage cap"; then, once `database_unavailable` above was given back
     * its own sentence, reworded again so the two no longer read as the
     * same message with one word swapped.
     */
    message:
      "This kind of search isn't switched on yet. Try again another time.",
  },
} as const satisfies Readonly<Record<string, UsageGateFailureShape>>;
