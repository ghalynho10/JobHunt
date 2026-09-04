import "server-only";

import type { CookieMethodsServer } from "@supabase/ssr";

import { isFailure, success, type Result } from "@/lib/result";

import { checkUsageGate, type UsageGateReason } from "./gate";

/**
 * The inversion of control spec 0011 itself flagged as owed, and spec 0013's
 * first real caller.
 *
 * A caller of `checkUsageGate()` directly can, in principle, forget to check
 * `allowed` before spending its outbound call. `withUsageGate()` makes that
 * structurally impossible instead of merely documented: `fn` is a thunk, and
 * it is invoked from inside this function's own body only once the decision
 * is `allowed: true`, so there is no path through this function that reaches
 * `fn` on a refusal.
 *
 * A refusal is returned as `success({ allowed: false, reason })`, never a
 * `Failure` (spec 0011, AC-5): it is the gate working exactly as designed,
 * not something broken. A `Failure` from `checkUsageGate()` itself (a broken
 * session check, a misconfigured call type, a database fault) is propagated
 * unchanged, and `fn` is never invoked for that case either.
 *
 * @param callType The gated call type, checked once before `fn` can run.
 * @param fn The outbound call to make, invoked only when the gate allows it.
 * @param cookieAdapter The same test seam `checkUsageGate()` exposes, absent
 * in every real caller.
 */
export async function withUsageGate<T>(
  callType: string,
  fn: () => Promise<Result<T>>,
  cookieAdapter?: CookieMethodsServer,
): Promise<
  Result<
    { allowed: true; value: T } | { allowed: false; reason: UsageGateReason }
  >
> {
  const decision = await checkUsageGate(callType, cookieAdapter);

  if (isFailure(decision)) return decision;

  if (!decision.value.allowed) {
    return success({ allowed: false, reason: decision.value.reason });
  }

  const outcome = await fn();

  if (isFailure(outcome)) return outcome;

  return success({ allowed: true, value: outcome.value });
}
