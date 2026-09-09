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
   *
   * THE VALUE TYPE WAS WIDENED FROM `string` TO INCLUDE `boolean` (2026-09-06,
   * spec 0015's Follow-up). `store` is a boolean provider option and would not
   * typecheck under the original `Record<string, string>`. It stays a closed
   * union of JSON primitives rather than becoming `unknown`, so the whole map
   * is still assignable to `JSONObject` and a caller cannot smuggle a function
   * or a class instance into a request body.
   */
  readonly providerOptions?: Readonly<
    Record<string, Readonly<Record<string, string | number | boolean>>>
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
   *
   * `store: false` OPTS THIS TIER OUT OF OPENAI'S 30 DAY RETENTION (spec 0015,
   * Follow-up, resolved 2026-09-06). `openaiProvider(modelId)` resolves to the
   * Responses API, which is the provider's default since AI SDK 5
   * (`node_modules/@ai-sdk/openai/docs/03-openai.mdx:43,122`, and the
   * `"openai.responses"` provider string `tiers.test.ts` already asserts).
   * That API's `store` option defaults to `true` (same file, line 156), and
   * OpenAI retains a stored request and response as "Application State" for a
   * minimum of 30 days (developers.openai.com/api/docs/guides/your-data,
   * read 2026-09-06). Feature 14 sends a real person's summary, skills and
   * work history through this tier, so the default meant a month of somebody's
   * career history sitting on a vendor's disk.
   *
   * IT COSTS NOTHING, WHICH IS WHY IT IS SAFE TO SET. Retention buys the
   * ability to reference a prior response by id, through `previousResponseId`
   * or an OpenAI conversation. Scoring is stateless per render (spec 0015,
   * "State transitions": none), makes one single step `generateObject` call
   * with no tools, and never continues a conversation, so there is nothing to
   * reference. The one case where `store: false` genuinely costs something,
   * carrying encrypted reasoning items across a multi step generation, needs
   * `include: ['reasoning.encrypted_content']` and more than one step; this
   * tier has neither. Setting this on a tier that later grows multi step tool
   * use is a decision to re-take, not a line to copy.
   *
   * TRAINING WAS NEVER THE EXPOSURE HERE. OpenAI has not trained on API
   * submitted data since 2023-03-01 unless a customer explicitly opts in, and
   * nothing in this repo opts in. Retention is the half that needed an action.
   */
  ai_scoring: {
    model: openaiProvider("gpt-5.6-luna"),
    temperature: undefined,
    maxOutputTokens: 2048,
    maxRetries: 0,
    timeoutMs: 30_000,
    providerOptions: { openai: { reasoningEffort: "medium", store: false } },
  },
  /**
   * Google, Gemini 3.5 Flash-Lite, deterministic at `temperature: 0`: the
   * narrower, more mechanical check task has no evident need for a reasoning
   * model, and a demonstrably different vendor than `ai_scoring` is what
   * feature 17's own done-when clause requires.
   *
   * `timeoutMs` IS MEASURED, NOT GUESSED, AND IT IS THE ONE FIELD HERE THAT
   * MUST NOT BE ROUNDED TO A COMFORTABLE NUMBER (spec 0019, AC-6). Five live
   * calls on 2026-09-09 against this exact model returned 928, 677, 684, 5905
   * and 5272 milliseconds. AC-6's rule is the slowest observed times three,
   * rounded up to the nearest 5 seconds and clamped between a 15 second floor
   * and a 30 second ceiling: 5905 x 3 = 17715, which rounds up to 20000 and
   * sits inside the clamp unchanged. The run is recorded in spec 0019's
   * Follow-up and the raw artifact is written to the gitignored
   * `test/integration/.output/ai-check-latency.json`.
   *
   * IT IS DELIBERATELY SHORTER THAN `ai_scoring`'S 30 SECONDS, which is the
   * point of measuring at all. The two tiers shared 30000 only because
   * `ai_check` had never been invoked in production and nobody knew better.
   * A check chains AFTER its own score (spec 0019, AC-5), so its timeout adds
   * directly to the worst case wait before a card settles; leaving it at 30
   * seconds would have made a page's worst case 60 seconds to buy headroom
   * roughly ten times the slowest call ever observed.
   *
   * THE SAMPLE IS FIVE CALLS, WHICH IS A HANDFUL AND NOT A DISTRIBUTION.
   * Spec 0019's Consequences records that as a known limit of this number
   * rather than hiding it. The spread already seen is wide (677ms to 5905ms
   * on identical input), so a slower tail than 5905ms is entirely plausible,
   * and the 3x multiplier is what absorbs it. Re-derive rather than nudge
   * this value if real traffic shows timeouts.
   */
  ai_check: {
    model: googleProvider("gemini-3.5-flash-lite"),
    temperature: 0,
    maxOutputTokens: 512,
    maxRetries: 0,
    timeoutMs: 20_000,
  },
};

/**
 * Narrows a tier's `model` to the real provider instance this file built
 * (spec 0017, AC-9 and AC-11).
 *
 * WHY A GUARD AND NOT A CAST. `LanguageModel` is the AI SDK's own union and it
 * also permits a plain gateway model id string. Neither entry in `TIERS` ever
 * constructs that form (both call a provider factory directly), so this reads
 * what the map really holds rather than asserting past the type. A cast would
 * hand a caller a `.modelId` that did not exist at runtime.
 *
 * IT LIVES HERE RATHER THAN IN A TEST because two callers now need it: the
 * spec 0012 guard in `tiers.test.ts` (which owned the original copy) and spec
 * 0017's eval harness, which reports the model id every run. The harness must
 * never type a model name of its own (AC-11), so it reads the answer off this
 * same resolved config, and both callers read one function rather than two
 * copies that agree today.
 *
 * Throws rather than returning a failure value: a `TIERS` entry holding a bare
 * string would be a programmer error in this file, not an expected failure.
 *
 * @param model One tier's configured model, e.g. `TIERS.ai_scoring.model`.
 * @returns The same model, narrowed past the string form.
 */
export function resolvedModel(
  model: LanguageModel,
): Exclude<LanguageModel, string> {
  if (typeof model === "string") {
    throw new Error(
      "Expected tiers.ts to construct a real provider model instance, got a plain model id string instead.",
    );
  }
  return model;
}
