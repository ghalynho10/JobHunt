## Context

Spec 0001 already named the two files this feature owns, `src/lib/ai/tiers.ts` for the tier to vendor and model map and `src/lib/ai/client.ts` for the router, and already bound the project to AI SDK 7 with direct provider packages, one key per vendor. What it left open is everything this spec decides: which two vendors, what shape a call takes, how a failure is told apart from a budget refusal, and how the two connect to the usage gate feature 10 already built.

Two callers are already named in the project's scope even though neither is designed yet. Feature 14, fit scoring with shown reasoning, needs a bulk call that returns a score plus the matched and missing skills, structured data, not prose. Feature 17, cross vendor self check, needs a second call that checks the first call's reasoning for fabricated skills, and its own done when clause requires that check to run on a demonstrably different vendor than scoring. Both callers need the router to hand back parsed, schema validated data, and neither should ever see a vendor name or a model string.

Feature 10 (usage gating and kill switch) is designed and built on a separate branch, `feat/usage-gating-kill-switch`, not yet merged to `main`, which is why it is invisible from a plain listing of this branch's specs. Its `checkUsageGate(callType, cookieAdapter)` is generic across `call_type` by design specifically so a new call type is a `usage_cap` row, never a migration or a new code path. This spec's router is the second caller of that gate, after `job_search`, and the two tier names chosen here double as the `call_type` strings that gate reads.

Money is the forcing constraint underneath all of this. Adzuna's own limits gave feature 10 a real ceiling to divide a budget against; a model vendor has no such ceiling, so the numbers this spec seeds into `usage_cap` are a spend decision, not a derivation from someone else's terms, and they are recorded here as dollars, not just call counts, so they can actually be judged against the named risk of uncontrolled cost during unemployment.

## Options considered

### Option 1: One generic tier dispatch function, structured output only

A single exported function takes a tier name, a Zod schema, and prompt content, resolves the tier's vendor and model from `tiers.ts`, calls the usage gate, then calls the vendor's `generateObject` with the fixed generation parameters `tiers.ts` names for that tier.

**Pros**:
- One function, one shape, matches both known callers (feature 14 and feature 17) exactly, since both need validated structured data, not prose.
- Nothing about a caller's request can widen a tier's cost profile, since generation parameters live in `tiers.ts`, not the call site.

**Cons**:
- A future caller that only wants a short plain text answer still has to shape a one field schema to use the router, a small amount of ceremony for a case that does not exist yet.

### Option 2: Two call functions, one for plain text and one for structured output

Expose both `generateTextTier()` and `generateObjectTier()`, mirroring the AI SDK's own `generateText` and `generateObject` split.

**Pros**:
- Matches the underlying SDK's own shape, so a future caller reads familiar AI SDK documentation directly.

**Cons**:
- Doubles the router's own surface, its tests, and its failure handling for a plain text path neither known caller needs. Every line of that second path is a line no acceptance criterion here exercises.

### Option 3: Callers construct the provider client directly, tiers.ts only holds config

`tiers.ts` stays a plain data map (tier to vendor name and model id); each caller imports the map and calls the AI SDK itself.

**Pros**:
- No router module to write at all, the smallest amount of new code.

**Cons**:
- This is the shape spec 0001 already rejected by naming `client.ts` as "the feature 13 router" in its own directory layout: without one call site, the usage gate check, the span, and the failure mapping would each need repeating in every caller, and a caller that forgets one of them fails silently rather than visibly.

## Rationale

Option 3 is ruled out first: spec 0001's own directory layout already names `client.ts` as this feature's router, which is a decision that a shared choke point is worth building, not a detail left open. Repeating the gate check, the span, and the failure mapping in every caller is exactly the shape that lets one caller forget a step, and a forgotten usage gate check is the named risk feature 10 exists to close, not a small omission.

Between Option 1 and Option 2, the deciding force is that both callers named in scope today, feature 14 and feature 17, need validated structured data, and the acceptance criteria a plain text path would satisfy do not exist yet. Building a second call shape now is the same failure pattern spec 0001's own binding rule 8 warns about deferred tooling choices: a candidate that cannot meet what is actually needed is not a candidate, and a plain text path meets no named need today. A future caller that genuinely wants prose can still ask for a one field schema, or this spec can be revisited when that caller exists.

## Vendor and budget derivation

**Vendors.** Anthropic answers the `ai_scoring` tier and Google answers the `ai_check` tier, so the two tiers sit on genuinely different infrastructure, satisfying feature 17's own done when clause that its check run on a demonstrably different vendor than scoring before feature 17 is even designed.

**Package versions, verified 2026-09-03 directly from the npm registry and from each package's own downloaded source** (`npm view`, then `npm pack` and read the unpacked `dist/index.d.ts`, not a secondary summary):
- `@ai-sdk/anthropic@4.0.49`: exports `anthropic` (a default instance) and `createAnthropic` (a factory). Defaults to the `ANTHROPIC_API_KEY` environment variable when no explicit key is passed.
- `@ai-sdk/google@4.0.63`: exports `google` and `createGoogle` (aliased `createGoogleGenerativeAI`). Defaults to the `GOOGLE_GENERATIVE_AI_API_KEY` environment variable.
- This spec has each provider built with the explicit factory, passing the key read from `src/env.ts`, rather than relying on the package's own implicit environment read: `src/env.ts` is this project's one validated boundary for every environment variable, and a value read directly from `process.env` inside a vendor package bypasses that boundary silently.

**Model ids and pricing, verified 2026-09-03 directly against each vendor's own current docs**:
- Anthropic: `claude-haiku-4-5` (the Claude API alias; the pinned dated snapshot is `claude-haiku-4-5-20251001`), $1 per million input tokens, $5 per million output tokens. Source: `https://platform.claude.com/docs/en/models/overview` and `https://platform.claude.com/docs/en/about-claude/pricing`.
- Google: `gemini-3.5-flash-lite`, described on Google's own page as "our fastest, most cost effective 3.5 model for high throughput execution," $0.30 per million input tokens, $2.50 per million output tokens. Source: `https://ai.google.dev/gemini-api/docs/models` and `https://ai.google.dev/gemini-api/docs/pricing`.
- **`claude-haiku-4-5` is an alias, not a pinned snapshot, and using it is Anthropic's own documented default.** Anthropic's own "Model IDs and versioning" page states plainly that for any model before the 4.6 generation, "these models also have shorter aliases... that point to the most recent dated snapshot for that minor version," unlike dateless IDs from 4.6 onward, which are themselves pinned. Verified 2026-09-03 at `https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions`. Anthropic's own SDK guidance recommends writing the short alias in code, so shipping `claude-haiku-4-5` here is the documented default, not an oversight; the tradeoff is real regardless, since Haiku 4.5 predates 4.6 and the alias can silently start pointing at a newer Haiku build with no commit in this repository, which sits in tension with spec 0001's own stated goal that what is deployed always matches what is in git. Recorded as a Follow-up with a concrete trigger (see `index.md`) rather than switched to the dated snapshot here.

**The candidate set feature 16's eval harness should rank, prices verified 2026-09-03**:
| Model | Input | Output | Estimated monthly cost at this spec's ceiling (2000 calls, ~2000 in / ~500 out tokens) |
|---|---|---|---|
| GLM 5.3 Flash | $0.15 / MTok | $0.50 / MTok | ~$1.10 |
| Gemini 3.8 Flash | $0.75 / MTok (rising to $1.50 on 2027-01-01) | $3.75 / MTok (rising to $7.50 on 2027-01-01) | ~$6.75, doubling after 2027-01-01 |
| Claude Haiku 4.5 | $1.00 / MTok | $5.00 / MTok | ~$9.00 |
| Claude Sonnet 5 | $3.00 / MTok | $15.00 / MTok | ~$27.00 |

The whole candidate set spans roughly $26 a month at this spec's own ceiling, which is not a meaningful amount of money at this project's scale. Feature 16 should therefore rank these on accuracy against the ground truth set (feature 15) first, and treat price as a tiebreak only between models that score equivalently, not as the deciding force. GLM 5.3 Flash's price was not directly verified on Zhipu AI's own pricing page, which did not render its pricing table to a plain fetch; the $0.15 / $0.50 figures above are corroborated against OpenRouter's listing (`https://openrouter.ai/z-ai/glm-5.3-flash`), which documents a temporary 50% promotional rate of $0.075 / $0.25 through 2026-09-09 and states that rate is a discount off the figures above, so this spec treats $0.15 / $0.50 as the standing price and marks it corroborated rather than independently verified. GLM is also not a price only substitute: it is operated by Zhipu AI, a different jurisdiction than Anthropic or Google, so choosing it over the others is a deliberate data residency decision for the engineer, not something a benchmark result alone should settle; spec 0009's privacy notice would need a new statement if it is ever chosen.

**Budget derivation.** `usage_cap`'s account per week cap for `ai_scoring` mirrors `job_search`'s own value, 25, on the assumption that feature 14 makes one scoring call per search; if scoring turns out to run once per listing instead, the real multiplier is feature 14's own to state when it is designed (recorded as a Follow-up in `index.md`). With the check tier sampled at 1.0 for now (every scoring call also gets a check call, per the engineer's own answer), `ai_check`'s account per week cap is set equal to `ai_scoring`'s, 25, for the same reason: a lower number would leave some scored searches without a check, which is a partial failure that reads like a working page.

The global day and month ceilings, 66 and 2000, are borrowed from `job_search`'s own shape purely for one consistent budget structure across every row in `usage_cap`, not derived from any vendor ceiling the way `job_search`'s were derived from Adzuna's terms. What actually answers feature 10's named risk, uncontrolled cost during unemployment, is the dollar figure this ceiling implies: at 2000 calls a month and the rough token estimate above, `ai_scoring` on Claude Haiku 4.5 costs at most about $9 a month, and `ai_check` on Gemini 3.5 Flash-Lite costs at most about $1.60 a month, a combined worst case of about $10.60 a month. That is trivial at this project's scale, which is why mirroring `job_search`'s shape rather than inventing a tighter number was judged acceptable; a materially larger user base would need this arithmetic redone before trusting the same ceiling. The token counts behind these dollar figures, roughly 2000 input and 500 output tokens for a scoring call and 1000 input and 200 output tokens for a check call, are placeholders reasoned from the shape of the task (one job listing plus one profile in, one structured score or verdict out), not measured against a real prompt, since feature 14 and feature 17 do not exist yet.

**This arithmetic assumes exactly one vendor call per gated call.** `usage_cap` counts gate calls, since `checkUsageGate()` charges one budget unit per invocation regardless of what happens after. The AI SDK's own default `maxRetries` is 2, meaning a single gated call could make up to three real vendor calls if that default were left in place, which would move the true worst case from about $9 and $1.60 a month to about $27 and $4.80. `tiers.ts` therefore fixes `maxRetries: 0` for both tiers (recorded in `index.md`'s Build plan and Consequences), so the dollar figures above are also the real ceiling, not just the gated-call ceiling.

**Privacy consequence of the sample rate.** At sample rate 1.0, every profile and job description sent to Anthropic for scoring is also sent to Google for the check, every time, not one vendor per call but two. `src/features/legal/recipients.test.ts` is the drift guard this feature's own build trips: it reads every variable name out of `src/env.ts` and fails unless each is accounted for in `DATA_RECIPIENTS`, so the suite breaks the moment either `ANTHROPIC_API_KEY` or `GOOGLE_GENERATIVE_AI_API_KEY` is declared, which is why both registry entries are part of this feature's own build plan rather than a follow-up.

## References

**Project sources**:
- `AGENTS.md`, binding rules 2, 3, and 5 (the error model: `failure()`, `FailureKind`, `attempt()`), and the directory layout naming `src/lib/ai/tiers.ts` and `client.ts` as this feature's own files.
- Spec 0001, the "AI access" and "Model tier configuration" rows of its Proposed stack table.
- Spec 0011 (usage gating and kill switch), read in full on the `feat/usage-gating-kill-switch` branch (not yet merged), for `checkUsageGate()`'s real signature, its `UsageGateReason` union, and its AC-5 refusal-is-success pattern. `checkUsageGate()` was later relocated from `src/features/usage-gating/` to `src/lib/usage-gating/` within that same branch (pull request 86, commit `d309e65`), which is the path `index.md` cites.
- Spec 0009 (terms and privacy notices), its AC-5 recipients registry and drift guard.
- `src/lib/result.ts`, `src/env.ts`, `src/features/legal/recipients.ts`, `src/app/(marketing)/privacy/page.test.ts`, and `docs/observability/spans.md`, all read directly during this design.

**Practices & standards**:
- Reuse of an existing choke point over building a second, weaker one (mirrors spec 0011's own Option 1 versus Option 2 reasoning for the same shape of decision).

**Links** (web verified 2026-09-03):
- Claude models overview: `https://platform.claude.com/docs/en/models/overview` (the `claude-haiku-4-5` alias and its dated snapshot).
- Claude pricing: `https://platform.claude.com/docs/en/about-claude/pricing` (Claude Haiku 4.5 and Claude Sonnet 5 rates).
- Gemini models: `https://ai.google.dev/gemini-api/docs/models` (`gemini-3.5-flash-lite`).
- Gemini pricing: `https://ai.google.dev/gemini-api/docs/pricing` (Gemini 3.5 Flash-Lite and Gemini 3.8 Flash rates, including the 2027-01-01 increase).
- `@ai-sdk/anthropic` and `@ai-sdk/google` package source, read directly from the npm registry tarballs (`npm pack @ai-sdk/anthropic@4.0.49`, `npm pack @ai-sdk/google@4.0.63`), not a secondary summary.
- OpenRouter's GLM 5.3 Flash listing: `https://openrouter.ai/z-ai/glm-5.3-flash` (corroborates the standing $0.15 / $0.50 rate behind a temporary promotional discount; Zhipu AI's own pricing page did not render to a plain fetch).
