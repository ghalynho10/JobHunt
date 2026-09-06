import "server-only";

import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import { env } from "@/env";

/**
 * The two named tiers a caller may ask for (spec 0012, AC-1). Closed on
 * purpose: a caller names one of these two strings, never a vendor or a
 * model id, and a third tier is a spec change, not a call site choice.
 */
export type Tier = "ai_scoring" | "ai_check";

/**
 * One tier's fixed configuration. Every field here is decided once, in this
 * file, and never at a call site (AC-3): a caller cannot widen a tier's cost
 * profile by supplying its own vendor, model, or generation parameter.
 */
interface TierConfig {
  readonly model: LanguageModel;
  /**
   * `number | undefined`, not a plain `number`: `ai_scoring` (a reasoning
   * model) leaves this unset because the OpenAI API rejects an explicit
   * `temperature: 0` whenever `reasoning.effort` is anything other than
   * `"none"`, which this tier does not choose (see `tiers.test.ts` and
   * spec 0012's rationale, "The determinism decision").
   */
  readonly temperature: number | undefined;
  readonly maxOutputTokens: number;
  /**
   * Fixed at zero for both tiers. `usage_cap`'s seeded ceilings assume one
   * vendor call per gated call; the AI SDK's own default of 2 retries would
   * let a single gated call spend up to three real vendor calls while
   * `usage_cap` still reads the same budget. Do not raise this without
   * re-deriving the dollar ceilings in spec 0012's rationale.
   */
  readonly maxRetries: 0;
  /**
   * A plain number, never a constructed `AbortSignal`: `AbortSignal.timeout()`
   * starts counting the moment it is called, so one built here at module load
   * time would already read as expired long before most calls are made.
   * `callTier()` builds a fresh signal from this value on every call.
   */
  readonly timeoutMs: number;
  /**
   * Structurally compatible with `generateObject`'s own `providerOptions`
   * parameter (`Record<string, JSONObject>` in `@ai-sdk/provider`, not
   * re-exported from the top level `ai` package, so named locally rather
   * than imported).
   */
  readonly providerOptions?: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
}

/**
 * Each provider is constructed once, passing the validated key from
 * `src/env.ts` explicitly (AC-10), rather than left to the package's own
 * implicit `process.env` read.
 */
const openaiProvider = createOpenAI({ apiKey: env.OPENAI_API_KEY });
const googleProvider = createGoogle({
  apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
});

/**
 * The tier to vendor and model map (AC-1, AC-3). Swapping a tier's vendor,
 * model, or generation parameters is an edit to this file alone: nothing
 * outside `src/lib/ai/` may import an `@ai-sdk/` package (`tiers.test.ts`).
 */
export const TIERS: Readonly<Record<Tier, TierConfig>> = {
  /**
   * OpenAI, GPT-5.6 Luna at `reasoningEffort: "medium"` (spec 0012's
   * rationale: it beats Claude Haiku 4.5 on Artificial Analysis's Intelligence
   * Index at this effort, 39 vs 30, and costs roughly 5x less). `temperature`
   * is left unset because the OpenAI API returns HTTP 400 for an explicit
   * `temperature: 0` at any `reasoning.effort` other than `"none"`.
   * `maxOutputTokens` is sized up from a plain non-reasoning estimate to
   * leave headroom for this model's own hidden reasoning tokens, which are
   * billed as output and count against this ceiling.
   */
  ai_scoring: {
    model: openaiProvider("gpt-5.6-luna"),
    temperature: undefined,
    maxOutputTokens: 2048,
    maxRetries: 0,
    timeoutMs: 30_000,
    providerOptions: { openai: { reasoningEffort: "medium" } },
  },
  /**
   * Google, Gemini 3.5 Flash-Lite, deterministic at `temperature: 0`: the
   * narrower, more mechanical check task has no evident need for a reasoning
   * model, and a demonstrably different vendor than `ai_scoring` is what
   * feature 17's own done-when clause requires.
   */
  ai_check: {
    model: googleProvider("gemini-3.5-flash-lite"),
    temperature: 0,
    maxOutputTokens: 512,
    maxRetries: 0,
    timeoutMs: 30_000,
  },
};
