import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { CookieMethodsServer } from "@supabase/ssr";

import {
  attempt,
  failure,
  isFailure,
  success,
  type Result,
} from "@/lib/result";
import { readKillSwitch } from "@/lib/kill-switch";
import { createClient } from "@/lib/supabase/server";

import { USAGE_GATE_FAILURES } from "./failures";

/**
 * The five reasons `checkUsageGate()` can refuse a call (spec 0011, AC-3 and
 * AC-4). Closed on purpose: a sixth reason is a spec change, never a call site
 * choice.
 */
export type UsageGateReason =
  | "account_week_cap_reached"
  | "global_day_cap_reached"
  | "global_month_cap_reached"
  | "kill_switch_engaged"
  | "kill_switch_unavailable";

/** Every member of `UsageGateReason`, for `copy.ts` and its own tests to iterate. */
export const USAGE_GATE_REASONS: readonly UsageGateReason[] = [
  "account_week_cap_reached",
  "global_day_cap_reached",
  "global_month_cap_reached",
  "kill_switch_engaged",
  "kill_switch_unavailable",
];

const USAGE_GATE_REASON_SET: ReadonlySet<string> = new Set(USAGE_GATE_REASONS);

function isUsageGateReason(value: string): value is UsageGateReason {
  return USAGE_GATE_REASON_SET.has(value);
}

/**
 * A decided call. AC-5: a refusal is always this shape, never a `Failure` —
 * the gate refusing a call is the system working exactly as designed, and
 * marking that outcome's span failed would corrupt the ratio AC-10's alert
 * depends on.
 */
export type UsageGateDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: UsageGateReason };

/**
 * The atomic usage gate (spec 0011). Call once per outbound call of
 * `callType` before making it; proceed only if the decision comes back
 * `allowed: true`.
 *
 * THE ORDER IS THE CORRECTNESS (AC-7, AC-13). The named span opens as the
 * FIRST statement, before the caller is even checked: a span opened later
 * would leave a total denial outage with no denominator, exactly the failure
 * binding rule 4's ratio exists to catch. `getClaims()` runs next, then the
 * kill switch pre-check, then the atomic window check, in that order.
 *
 * @param cookieAdapter Where the session cookies are read from, matching
 * `createClient()`'s own parameter (spec 0004): absent in every real caller,
 * which reads the real request; a test drives this module with an in memory
 * jar instead, the same one every page and Server Action is proved against.
 */
export async function checkUsageGate(
  callType: string,
  cookieAdapter?: CookieMethodsServer,
): Promise<Result<UsageGateDecision>> {
  return Sentry.startSpan(
    { name: "usage_gate.check", op: "function" },
    async (): Promise<Result<UsageGateDecision>> => {
      const supabase = await createClient(cookieAdapter);

      /**
       * BINDING RULE 5: `getClaims()` reaches Supabase's JWKS endpoint and can
       * throw, which is different from the returned `error` that means an
       * invalid, expired or absent session (AC-13, matching
       * `src/features/profile/actions.ts`'s own `callerId()`). Never
       * `getSession()`, which reads the cookie's contents without verifying
       * them: a forged session on this path would spend someone else's
       * budget, not just read someone else's data.
       */
      const claims = await attempt(
        {
          kind: "external_service_failed",
          message: "Could not verify the session.",
        },
        () => supabase.auth.getClaims(),
      );

      if (isFailure(claims)) return claims;

      const { data, error: claimsError } = claims.value;

      if (claimsError || !data) {
        return failure({
          kind: USAGE_GATE_FAILURES.session_missing.kind,
          severity: USAGE_GATE_FAILURES.session_missing.severity,
          message: USAGE_GATE_FAILURES.session_missing.message,
        });
      }

      /**
       * AC-4: `readKillSwitch()` directly, never the collapsed
       * `isKillSwitchEngaged()` boolean, because that would lose the
       * distinction between a deliberate flip and a broken read. Neither
       * outcome ever reaches `check_usage_gate`: a kill switch block is
       * refused here, before any window is touched at all, so it increments
       * no `usage_gate_counter` row.
       */
      const killSwitch = await readKillSwitch();

      if (isFailure(killSwitch)) {
        return success({ allowed: false, reason: "kill_switch_unavailable" });
      }

      if (killSwitch.value.enabled) {
        return success({ allowed: false, reason: "kill_switch_engaged" });
      }

      const rpc = await attempt(
        {
          kind: USAGE_GATE_FAILURES.database_unavailable.kind,
          message: USAGE_GATE_FAILURES.database_unavailable.message,
        },
        async () =>
          await supabase
            .rpc("check_usage_gate", { p_call_type: callType })
            .single(),
      );

      if (isFailure(rpc)) return rpc;

      const { data: row, error: rpcError } = rpc.value;

      /**
       * AC-14: the `.rpc()` response's own `error` is inspected before
       * `configured`, `allowed` or `reason` is ever read. `data: null` with
       * no `error` is ALSO `database_unavailable`, never an absent, harmless
       * decision: a genuine database fault arrives through this same
       * `{ data: null, error }` channel, not as a thrown exception, so reading
       * only the output columns here would decide nothing at all, which is a
       * silent open rather than a fail closed one.
       */
      if (rpcError || !row) {
        return failure({
          kind: USAGE_GATE_FAILURES.database_unavailable.kind,
          severity: USAGE_GATE_FAILURES.database_unavailable.severity,
          message: USAGE_GATE_FAILURES.database_unavailable.message,
          context: { code: rpcError?.code, hint: rpcError?.hint },
          cause: rpcError ?? undefined,
        });
      }

      /**
       * AC-6: the atomic function never raises to signal this, it returns
       * `configured: false` as an ordinary output column. `allowed` and
       * `reason` carry no meaning when `configured` is false, so neither is
       * read below this point.
       */
      if (!row.configured) {
        return failure({
          kind: USAGE_GATE_FAILURES.usage_gate_misconfigured.kind,
          severity: USAGE_GATE_FAILURES.usage_gate_misconfigured.severity,
          message: USAGE_GATE_FAILURES.usage_gate_misconfigured.message,
          context: { callType },
        });
      }

      if (row.allowed) return success({ allowed: true });

      /**
       * A shape `check_usage_gate` cannot actually produce: `configured` true,
       * `allowed` false, and a `reason` outside the closed set above. Treated
       * the same as a database fault rather than crashing or inventing a
       * sixth reason, since something between the function and this parse is
       * broken either way.
       */
      if (!row.reason || !isUsageGateReason(row.reason)) {
        return failure({
          kind: USAGE_GATE_FAILURES.database_unavailable.kind,
          severity: USAGE_GATE_FAILURES.database_unavailable.severity,
          message: USAGE_GATE_FAILURES.database_unavailable.message,
          context: { callType, reason: row.reason },
        });
      }

      return success({ allowed: false, reason: row.reason });
    },
  );
}
