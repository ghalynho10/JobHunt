import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { CookieMethodsServer } from "@supabase/ssr";
import { NoObjectGeneratedError, generateObject } from "ai";
import type { ZodType } from "zod";

import { failure, success, type Result } from "@/lib/result";
import type { UsageGateReason } from "@/lib/usage-gating/gate";
import { withUsageGate } from "@/lib/usage-gating/with-usage-gate";

import { AI_ROUTER_FAILURES } from "./failures";
import { TIERS, type Tier } from "./tiers";

/**
 * The one door every AI model call walks through (spec 0012).
 *
 * A caller names a tier, `"ai_scoring"` or `"ai_check"`, and gets back the
 * schema's parsed type, never a vendor name or a model id: `tiers.ts` is the
 * only place that mapping exists (AC-1, AC-3).
 *
 * BINDING RULE 4: the named span opens as the FIRST statement, before the
 * usage gate is even checked, so a total outage of either the gate or a
 * provider leaves a denominator behind (AC-7).
 *
 * The gate is checked before the vendor is ever called (AC-4), reusing
 * `withUsageGate()` unchanged (spec 0011, `job_search`'s own caller shape):
 * a refusal comes back as `success({ allowed: false, reason })`, never a
 * `Failure`, so the gate working exactly as designed cannot corrupt this
 * span's own failure ratio.
 *
 * @param tier Which configured tier answers this call.
 * @param schema The caller's own Zod schema; the vendor's answer is parsed
 * against it and never trusted unparsed.
 * @param prompt The user content sent to the model.
 * @param options.system Optional system content.
 * @param options.cookieAdapter The same test seam `checkUsageGate()` exposes,
 * absent in every real caller.
 */
export async function callTier<T>(
  tier: Tier,
  schema: ZodType<T>,
  prompt: string,
  options?: {
    readonly system?: string;
    readonly cookieAdapter?: CookieMethodsServer;
  },
): Promise<
  Result<
    | { readonly allowed: true; readonly value: T }
    | { readonly allowed: false; readonly reason: UsageGateReason }
  >
> {
  return Sentry.startSpan(
    { name: "ai.call_tier", op: "function", attributes: { tier } },
    async () =>
      withUsageGate(
        tier,
        () => generateForTier(tier, schema, prompt, options?.system),
        options?.cookieAdapter,
      ),
  );
}

/**
 * The vendor call itself, invoked by `withUsageGate()` only once the gate
 * allows it.
 *
 * `generateObject` throws one error type whether the vendor call failed or
 * its answer did not match the schema (spec 0012, key invariant), so the
 * caught error is classified with a pure function, `classify()`, before
 * exactly one `failure()` call follows.
 */
async function generateForTier<T>(
  tier: Tier,
  schema: ZodType<T>,
  prompt: string,
  system: string | undefined,
): Promise<Result<T>> {
  const config = TIERS[tier];

  try {
    const { object } = await generateObject({
      model: config.model,
      schema,
      system,
      prompt,
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      maxRetries: config.maxRetries,
      abortSignal: AbortSignal.timeout(config.timeoutMs),
      ...(config.providerOptions !== undefined
        ? { providerOptions: config.providerOptions }
        : {}),
    });

    return success(object);
  } catch (error) {
    const kind = classify(error);

    /**
     * A span attribute, never `context` (an event level field `failure()`
     * sets, never queryable as a span filter): this is what tells this
     * router's own `external_service_failed` apart from the usage gate's own
     * use of the same kind, the same way feature 10 had to make
     * `failure.kind` itself a span attribute rather than trust the span's
     * status message.
     */
    Sentry.getActiveSpan()?.setAttribute("stage", "vendor");

    return failure({
      kind: AI_ROUTER_FAILURES[kind].kind,
      severity: AI_ROUTER_FAILURES[kind].severity,
      message: AI_ROUTER_FAILURES[kind].message,
      cause: error,
    });
  }
}

/**
 * Which of the two vendor call failure kinds a caught `generateObject` error
 * is (spec 0012, key invariant). A pure function, mirroring `classify()` in
 * `src/features/auth/callback.ts`: it reads the error and nothing else, so a
 * test can drive it directly with constructed error instances, no vendor
 * call needed.
 *
 * Exported so `client.test.ts` can call it with a constructed
 * `NoObjectGeneratedError` and a constructed `APICallError` directly.
 */
export function classify(
  error: unknown,
): "response_malformed" | "external_service_failed" {
  return NoObjectGeneratedError.isInstance(error)
    ? "response_malformed"
    : "external_service_failed";
}
