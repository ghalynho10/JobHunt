import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { CookieMethodsServer } from "@supabase/ssr";
import { z } from "zod";

import {
  attempt,
  failure,
  isFailure,
  success,
  type Result,
} from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

import { USAGE_GATE_FAILURES } from "./failures";

/**
 * The usage gate's one read path (spec 0020).
 *
 * STRICTLY READ ONLY, WHICH IS THE WHOLE POINT OF ITS BEING SEPARATE FROM
 * `checkUsageGate()`. The gate decides and, in deciding, upserts window rows
 * into existence and increments them. This asks a question and changes
 * nothing, so a bare `/search` visit that spends no budget also writes no
 * counter row (AC-3). Two operations, two functions, two spans.
 *
 * IT SHARES `USAGE_GATE_FAILURES` WITH THE GATE rather than defining its own
 * three kinds. The failures are the same three situations, worded once, and a
 * second copy would drift. What this path does NOT share is the sentence the
 * reader sees: a failed usage read renders `SEARCH_COPY.usageUnavailable`
 * (`COPY-2`), because the failure costs the number and nothing else, while
 * these messages are written for a caller whose search was actually stopped.
 */

/**
 * `get_job_search_usage_summary`'s own return row, parsed rather than trusted
 * (`AGENTS.md`, parse at every boundary), on exactly the reasoning
 * `checkUsageGateRowSchema` in `gate.ts` records: the generated
 * `database.types.ts` types every column here as non nullable, which actively
 * lies. The function returns `null::integer` for all three values on the
 * unconfigured path, so the generated type says what the schema claims and
 * this says what actually arrived.
 */
const usageSummaryRowSchema = z.object({
  configured: z.boolean(),
  consumed_count: z.number().int().nonnegative().nullable(),
  cap_value: z.number().int().nonnegative().nullable(),
  period_start: z.string().nullable(),
});

/** The caller's own `job_search` usage for the current account week. */
export interface JobSearchUsageSummary {
  /** `usage_gate_counter.consumed_count`, never `attempt_count` (AC-2). */
  readonly consumedCount: number;
  /** Read live from `usage_cap`, never a literal in this codebase (AC-5). */
  readonly capValue: number;
  /** The account week window's UTC start, as `YYYY-MM-DD`. */
  readonly periodStart: string;
}

/**
 * Reads the caller's own `job_search` usage against their account week cap
 * (spec 0020, AC-1).
 *
 * THE ORDER IS THE SAME ORDER `checkUsageGate()` USES, and for the same
 * reason. The named span opens as the FIRST statement, before the caller is
 * even checked (binding rule 4): a span opened after a guard clause leaves a
 * total outage with no denominator. `getClaims()` runs next, then the RPC.
 *
 * BINDING RULE 5: `getClaims()`, never `getSession()`. This is defense in
 * depth rather than the real guarantee, exactly as in the gate: the account
 * scope is `auth.uid()` read inside the `security definer` function itself,
 * so a caller cannot name another account even if this check were removed
 * (AC-7). The check earns its place by refusing a signed out caller here,
 * before a round trip, and by keeping one identity pattern across every
 * server side reader in this codebase.
 *
 * IT COVERS THE ACCOUNT WEEK WINDOW ALONE (AC-1). The two app wide caps and
 * the two kill switch states are deliberately not previewed: they are not a
 * consequence of anything this person did, and they stay exactly as legible
 * as they already are, a plain sentence at the moment of refusal.
 *
 * @param cookieAdapter Where the session cookies are read from, matching
 * `checkUsageGate()`'s own parameter: absent in every real caller, which reads
 * the real request; a test drives this with an in memory jar instead.
 */
export async function getJobSearchUsageSummary(
  cookieAdapter?: CookieMethodsServer,
): Promise<Result<JobSearchUsageSummary>> {
  return Sentry.startSpan(
    { name: "usage_gate.read_summary", op: "db.query" },
    async (): Promise<Result<JobSearchUsageSummary>> => {
      const supabase = await createClient(cookieAdapter);

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

      const rpc = await attempt(
        {
          kind: USAGE_GATE_FAILURES.database_unavailable.kind,
          message: USAGE_GATE_FAILURES.database_unavailable.message,
        },
        async () => await supabase.rpc("get_job_search_usage_summary").single(),
      );

      if (isFailure(rpc)) return rpc;

      const { data: row, error: rpcError } = rpc.value;

      /**
       * The response's own `error` is inspected before any output column is
       * read, and `data: null` with no `error` is a failure too, on
       * `checkUsageGate()`'s own AC-14 reasoning: a genuine database fault
       * arrives through this `{ data: null, error }` channel rather than as a
       * thrown exception, so reading only the columns here would report a
       * confident zero through an outage.
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

      const parsed = usageSummaryRowSchema.safeParse(row);

      if (!parsed.success) {
        return failure({
          kind: USAGE_GATE_FAILURES.database_unavailable.kind,
          severity: USAGE_GATE_FAILURES.database_unavailable.severity,
          message: USAGE_GATE_FAILURES.database_unavailable.message,
          context: { issues: z.treeifyError(parsed.error) },
          cause: parsed.error,
        });
      }

      /**
       * The same all or nothing configuration rule the gate applies, reported
       * the same way: an ordinary output column, never a raised exception.
       * `job_search` missing any one of its three `usage_cap` rows is a call
       * type the gate itself would refuse to decide, so showing a number
       * beside it would promise an allowance that does not exist.
       */
      if (!parsed.data.configured) {
        return failure({
          kind: USAGE_GATE_FAILURES.usage_gate_misconfigured.kind,
          severity: USAGE_GATE_FAILURES.usage_gate_misconfigured.severity,
          message: USAGE_GATE_FAILURES.usage_gate_misconfigured.message,
          context: { callType: "job_search" },
        });
      }

      const { consumed_count, cap_value, period_start } = parsed.data;

      /**
       * `configured: true` means all three values are present, but the type
       * cannot know that and neither should this code assume it. A row that
       * says configured and carries a null is the function and this parse
       * disagreeing, which is the same broken state any other malformed row
       * is, not a zero worth rendering.
       */
      if (
        consumed_count === null ||
        cap_value === null ||
        period_start === null
      ) {
        return failure({
          kind: USAGE_GATE_FAILURES.database_unavailable.kind,
          severity: USAGE_GATE_FAILURES.database_unavailable.severity,
          message: USAGE_GATE_FAILURES.database_unavailable.message,
          context: {
            configured: true,
            consumed_count,
            cap_value,
            period_start,
          },
        });
      }

      return success({
        consumedCount: consumed_count,
        capValue: cap_value,
        periodStart: period_start,
      });
    },
  );
}
