# 0012. Model client router

**Date**: 2026-09-03
**Status**: Proposed

## Summary

This spec builds the one door every AI model call walks through. A feature names a tier, "ai_scoring" or "ai_check", and gets back a validated structured result or a visible failure; it never names a vendor or a model. The two tiers are configured in one checked in file to two different vendors, Anthropic for scoring and Google for the cross vendor check, so swapping a model later is an edit to that one file. Every call passes through feature 10's usage gate first, using the tier name as the budget's call type, so the router never becomes a way to spend past that gate by accident.

## Requirements

**User stories**:
- As a feature calling the router (feature 14, then feature 17), I want to name a tier and get back data that matches my schema, so I never have to know or care which vendor or model answers the call.
- As the operator, I want a model swap to be a one file change, so a bad model or a price change does not require touching every caller.
- As the operator, I want a provider failure to come back as a visible, typed failure, never as a default value that reads like a working answer.
- As the operator, I want every model call to respect the same budget and kill switch feature 10 already built, so this router cannot become a second, ungoverned way to spend money.

**Acceptance criteria**:
- **AC-1**: `src/lib/ai/tiers.ts` exports a closed set of tier names, `"ai_scoring"` and `"ai_check"`, each mapped to a distinct vendor provider instance and a specific model id. The two tiers resolve to two different vendor packages, checked by a test that reads the map itself, not by inspecting a call site.
- **AC-2**: The router's one exported call function takes a tier name, a Zod schema, and the prompt content, and returns the schema's parsed type inside a `Result`. There is no plain text only call surface.
- **AC-3**: A caller never supplies a vendor name, a model id, or a generation parameter such as temperature, max output tokens, or retry count; every one of those is fixed per tier in `tiers.ts`. Changing a tier's vendor, model, or generation parameters is an edit to `tiers.ts` alone, proven by a test asserting that no file under `src/` other than `tiers.ts` imports an `@ai-sdk/` package.
- **AC-4**: Before dispatching a call, the router calls `checkUsageGate()` (feature 10) with the tier name as `callType`. A refusal, `{ allowed: false, reason }`, is returned to the caller as a decided outcome, never as a `Failure`, matching feature 10's own AC-5 pattern for the same reason: the gate working exactly as designed must not corrupt this router's own failure ratio.
- **AC-5**: A provider call that throws or times out becomes a `Failure` with kind `external_service_failed`, severity `unexpected`. Nothing catches this and returns a default value in its place.
- **AC-6**: A model response that does not validate against the caller's Zod schema becomes a `Failure` with kind `response_malformed`, severity `unexpected`. There is no repair attempt and no retry of a schema mismatch specifically.
- **AC-7**: The router's own named span opens as the first statement of the call, before the usage gate check and before any guard clause, so a total outage of either the gate or a provider leaves a denominator behind.
- **AC-8**: `usage_cap` holds six seed rows from this feature's migration: `(ai_scoring, account, week, 25)`, `(ai_scoring, global, day, 66)`, `(ai_scoring, global, month, 2000)`, `(ai_check, account, week, 25)`, `(ai_check, global, day, 66)`, `(ai_check, global, month, 2000)`. Neither tier is `usage_gate_misconfigured` from the moment this feature ships.
- **AC-9**: `DATA_RECIPIENTS` gains two new entries, `anthropic` and `google-ai`, each with the exact `src/env.ts` key that reaches it. The existing `google` entry (Google's sign in purpose) is left untouched, since it is a different, unrelated flow: widening one entry to cover two purposes would make its own "only if Google is the account chosen" wording false for the new purpose. The privacy page's own `notYetRecipients` watchlist (`src/app/(marketing)/privacy/page.test.ts`) no longer names Anthropic, and its comment no longer claims a set of arriving companies this feature's real choice does not match.
- **AC-10**: `ANTHROPIC_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` are declared in `src/env.ts`'s server schema as required, non empty strings, and each provider client is built by passing that validated value explicitly. Neither key is left to the provider package's own implicit environment read.

## Decision

**Chosen option**: Option 1: One generic tier dispatch function, structured output only.

**Implementation skills**: `ai-sdk` (Vercel's official plugin skill, invoke via `Skill(vercel:ai-sdk)`, no `.agents/skills/` clone). Its default push toward routing every call through the Vercel AI Gateway is overridden here on purpose: spec 0001 already bound this project to direct provider packages, one key per vendor, specifically so personal data flows only to the vendors the privacy notice names.

## Feature design

**Data model sketch**:
No new table. This feature adds six rows to `usage_cap` (feature 10, not yet merged to `main`), one triple of account/week, global/day, global/month for each of `ai_scoring` and `ai_check`, using that table's existing shape. See `rationale.md` for the derivation behind the six values.

**State transitions**: none. The router is stateless; each call is independent.

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `callTier()` (`src/lib/ai/client.ts`) | server function | `tier: "ai_scoring" \| "ai_check"`, `schema: ZodType<T>`, `system?: string`, `prompt: string`, `cookieAdapter?` (test injection, matching `checkUsageGate()`'s own parameter) | `Result<{ allowed: true; value: T } \| { allowed: false; reason: UsageGateReason }>` | inherited from `checkUsageGate()`, which verifies the caller with `getClaims()` before this router ever reaches a vendor | `session_missing`, `usage_gate_misconfigured`, `database_unavailable` (all from the gate), `external_service_failed`, `response_malformed` (from the vendor call) |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| `callTier()` | which vendor and model answer the call | `tiers.ts`, keyed by the `tier` argument, never the caller |
| `callTier()` | the budget the call is checked against | `usage_cap`, keyed by the tier name used as `call_type`, read inside `checkUsageGate()` |
| `callTier()` | the parsed value returned on success | the vendor's structured response, parsed against the caller's own `schema` argument |
| a refusal's reason | which of the five `UsageGateReason` values is reported | `checkUsageGate()`, unchanged from feature 10 |
| a provider failure's message | the text shown in Sentry and to a caller that surfaces it | a fixed, non secret message per failure kind, written in `src/lib/ai/failures.ts` (mirroring the shape of `USAGE_GATE_FAILURES`), never the vendor's own raw error text (which can carry request content) |
| a provider failure's kind | `response_malformed` versus `external_service_failed` | the `classify()` function's read of the caught `generateObject` error, per the Key invariant above |
| a provider failure's `stage` | told apart from the gate's own use of `external_service_failed` | a span attribute (`span.setAttribute("stage", "vendor")`), never `context`, since `context` is not queryable on a span |

**Key invariants**:
- A caller never learns, and never needs to learn, which vendor answered a tier. The only place that mapping exists is `tiers.ts`.
- A refused call and a failed call are never the same shape. Refusal is `success({ allowed: false, reason })`; a broken gate or a broken vendor is a `Failure`. Collapsing the two would corrupt the ratio AC-7's span exists to protect, the same reasoning feature 10's own AC-5 already applies.
- The usage gate check always runs before the vendor is ever called. No code path reaches a vendor without first getting `{ allowed: true }` back.
- `generateObject` throws one error type whether the vendor call itself failed or the vendor's answer did not match the schema, so a single `attempt()` call (which carries one fixed `FailureKind`) cannot tell the two apart. The router classifies the caught error with a pure function before it calls `failure()`, mirroring `classify()` in `src/features/auth/callback.ts`: `NoObjectGeneratedError.isInstance(error)` becomes `response_malformed`, anything else becomes `external_service_failed`. Exactly one `failure()` call follows the classification, never two, and the classifier is tested directly with constructed error instances, with no vendor call needed to exercise it.
- A tier's generation parameters (temperature, output length, and retry count) are fixed at zero retries in `tiers.ts`. `checkUsageGate()` charges one budget unit per call regardless of how many vendor calls answer it, so a retried call spends more real money than the budget accounted for; see Consequences for what a non zero retry count would do to the numbers in `rationale.md`.
- The router's own failure and the usage gate's own failure can both carry `external_service_failed`, since `checkUsageGate()` already uses that kind for its own session check, and both fingerprint into the same Sentry issue by kind (binding rule 3). The router's span sets `stage: "vendor"` as a span attribute, not `context` (an event level field `failure()` sets, never queryable as a span filter), the same way feature 10 had to make `failure.kind` itself a span attribute (`span.setAttribute`) rather than trust the span's status message, after finding the status message unqueryable in a real forced failure test. A `context` only version of this invariant would look identical here and pass every test, then hit the same wall the first time someone writes an alert.

**Security model**: No new authorisation model. `checkUsageGate()` verifies the caller with `getClaims()` before this router is reached at all; a signed out caller never reaches a vendor. `ANTHROPIC_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` are server only values read through `src/env.ts`, never reachable from the browser, matching every other credential in this project.

**Configuration required**:
- `ANTHROPIC_API_KEY`: the Anthropic API key backing the `ai_scoring` tier.
- `GOOGLE_GENERATIVE_AI_API_KEY`: the Google Generative AI API key backing the `ai_check` tier.

**Critical test scenarios**:
- Happy path: calling each tier with a small real schema against a real vendor returns a parsed value matching that schema, and the two tiers are proven to hit two different vendors, verifies **AC-1**, **AC-2**. Gated behind `TEST_LIVE_MODEL_CALLS_ENABLED`, read directly from `process.env` in the test helper and unset by default, mirroring `TEST_DIRECT_DB_ENABLED`'s own pattern (`test/helpers/database.ts`), so a plain `pnpm test:integration` run never spends real vendor money.
- Failure case, unit level: `classify()` is called directly with a constructed `NoObjectGeneratedError` and returns the code that maps to `response_malformed`, and with a constructed `APICallError` and returns the code that maps to `external_service_failed`, with no vendor call needed to exercise either branch, verifies **AC-5**, **AC-6**.
- Failure case: a `usage_cap` row set to `0` for a tier in a test refuses every call to that tier with `success({ allowed: false, reason: "account_week_cap_reached" })` (or the matching reason), and the vendor is never called, verifies **AC-4**, **AC-8**.
- Auth/permission: a call made with no valid session returns `session_missing` before any vendor is reached, inherited unchanged from `checkUsageGate()`, verifies **AC-4**.

## Build plan

1. Add `@ai-sdk/anthropic`, `@ai-sdk/google`, and `ai` to `package.json`. Add `ANTHROPIC_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` to `src/env.ts`'s server schema (required, non empty), to its `runtimeEnv` block (the drift guard in `recipients.test.ts` only reads that block), and to `.env.example` and `.env.test.example`, satisfies **AC-10**.
2. Write the migration seeding the six `usage_cap` rows for `ai_scoring` and `ai_check`. Blocked until feature 10's `usage_cap` table exists on `main` (see Consequences), satisfies **AC-8**.
3. Write `src/lib/ai/tiers.ts`: the `Tier` union, and the checked in map from tier to `{ model, temperature: 0, maxOutputTokens (1024 for ai_scoring, 512 for ai_check), maxRetries: 0, timeoutMs: 30_000 }`, constructing each vendor's provider instance (`createAnthropic`, `createGoogle`) by passing the validated `env.ANTHROPIC_API_KEY` / `env.GOOGLE_GENERATIVE_AI_API_KEY` explicitly. The map stores `timeoutMs`, a plain number, never a constructed `AbortSignal`: `AbortSignal.timeout()` starts counting the moment it is called, so one built at module load time would already read as expired for every call made after the first thirty seconds of the process's life. `callTier()` builds a fresh `AbortSignal.timeout(tier.timeoutMs)` on every call, satisfies **AC-1**, **AC-3**, **AC-10**.
4. Write `src/lib/ai/failures.ts`, a fixed, non secret message per new failure kind used here, mirroring the shape of `USAGE_GATE_FAILURES`, satisfies the Value sourcing row for a provider failure's message.
5. Write `src/lib/ai/client.ts`: `callTier()`, opening the named span `ai.call_tier` (`op: "function"`, `tier` as a span attribute, one name for both tiers) as the first statement, calling `checkUsageGate(tier, cookieAdapter)`, branching on the decision, then calling `generateObject` with a freshly built `AbortSignal.timeout(tier.timeoutMs)` inside a single `try`/`catch` (not `attempt()`, which carries one fixed kind) with the tier's fixed vendor, model and parameters and the caller's schema; on a caught error, `classify()` (a pure function, mirroring `src/features/auth/callback.ts`) reads it, the active span gets `span.setAttribute("stage", "vendor")`, and exactly one `failure()` call follows, `response_malformed` for `NoObjectGeneratedError.isInstance(error)`, `external_service_failed` otherwise, satisfies **AC-2**, **AC-4**, **AC-5**, **AC-6**, **AC-7**.
6. Write a test asserting no file under `src/` other than `src/lib/ai/tiers.ts` imports an `@ai-sdk/` package, satisfies **AC-3**.
7. Register the `ai.call_tier` span in `docs/observability/spans.md`, satisfies **AC-7**.
8. Add two new `DATA_RECIPIENTS` entries, `anthropic` and `google-ai`, leaving the existing `google` entry untouched; remove `"Anthropic"` from `notYetRecipients` in `src/app/(marketing)/privacy/page.test.ts` and correct its comment; update the id array assertion in `recipients.test.ts` (line 110) to include both new ids, satisfies **AC-9**.
9. Write the critical test scenarios above: the `classify()` unit tests (no vendor call needed), a zeroed cap refusing without reaching a vendor, and, gated behind `TEST_LIVE_MODEL_CALLS_ENABLED`, both tiers reaching two real, different vendors, satisfies **AC-1** through **AC-8**.

## Consequences

**Positive**:
- Every future AI caller (feature 14, feature 17, and anything after) gets budget enforcement, a visible failure model, and a config only vendor swap for free, by construction, rather than by remembering to add each one.
- Reusing `checkUsageGate()` unchanged means this feature adds no new database function and no new `plpgsql` to review; it is entirely new rows in an existing table plus application code.

**Negative / tradeoffs**:
- This feature's migration and its integration tests cannot run until feature 10 (`usage_cap`, `checkUsageGate`) merges into `main`; it currently exists only on `feat/usage-gating-kill-switch`.
- `src/lib/ai/client.ts` imports `checkUsageGate` and `UsageGateReason` from `src/lib/usage-gating/`, not a feature folder: feature 10's pull request 86 (commit `d309e65`) already moved the module there, on the same reasoning this spec would otherwise have had to raise, that code shared by more than one feature belongs in `src/lib` (`kill-switch.ts` already set that precedent, and `checkUsageGate()` is now shared by features 11, 13, and 14). No open layering question remains for this feature to inherit.
- The global day and month caps (66, 2000) are borrowed from `job_search`'s own shape for consistency across `usage_cap`, not derived from any external vendor ceiling the way `job_search`'s were derived from Adzuna's terms. A reader must not assume 66 or 2000 reflects a vendor limit; the number that actually bears on the named risk is the dollar ceiling in `rationale.md`.
- `checkUsageGate()` marks budget consumed as soon as it decides `allowed: true`, before the vendor is ever called, the same shape `job_search` already accepts. A vendor outage during a busy week can burn an account's entire weekly `ai_scoring` budget on calls that returned nothing, exactly as an Adzuna outage could already burn `job_search`'s.
- `tiers.ts` fixes `maxRetries: 0` specifically because the dollar ceilings in `rationale.md` assume one vendor call per gated call. Restoring the AI SDK's own default of 2 retries would let a single gated call make up to three vendor calls while `usage_cap` still reads the same 2000 a month, moving the real worst case from about $9 and $1.60 a month to about $27 and $4.80. Do not raise `maxRetries` above 0 without re-deriving those figures.
- With the check tier sampled at 1.0 (every scoring call also gets a check call), every profile and job listing sent to Anthropic for scoring is also sent to Google for the check, not one vendor per call but two, every time.
- `claude-haiku-4-5` is a convenience alias, not a pinned snapshot, for any Claude model before the 4.6 generation, and writing the alias in code is Anthropic's own documented default. Anthropic can still repoint it to a newer Haiku build without a commit here, which sits in tension with spec 0001's own stated goal that what is deployed always matches what is in git; see Follow-up for the concrete trigger to revisit it. Separately, Haiku 4.5 carries a 200K token context window against the 1M the other current Claude models carry, fine for one listing against one profile but a real constraint if feature 14 ever batches many listings into a single call.
- The two vendors and models named here are provisional defaults for feature 16's eval harness to rank against, not a settled choice on accuracy; see `rationale.md`.

**Neutral**:
- The token counts behind the dollar estimates in `rationale.md` (roughly 2000 input and 500 output tokens for a scoring call, 1000 input and 200 output for a check call) are rough placeholders until feature 14 and feature 17's real prompts exist.

## Follow-up

- [ ] This spec is numbered 0012 rather than 0011 because feature 10's own spec already claims 0011 on the still unmerged `feat/usage-gating-kill-switch` branch. Renumber if the two branches land in a different order than expected.
- [ ] Feature 14 confirms or corrects the "one scoring call per search" assumption behind `ai_scoring`'s account per week cap of 25; if scoring is per listing rather than per search, the multiplier belongs in a `usage_cap` update, not a migration.
- [ ] Feature 17 decides its real sample rate for the check tier. If it drops below 1.0, `ai_check`'s three `usage_cap` rows must be lowered in the same change; a cap left at the scoring tier's level while only a fraction of calls are actually sampled no longer bounds real spend.
- [ ] Feature 16's eval harness should rank the candidate set recorded in `rationale.md` (GLM 5.3 Flash, Gemini 3.8 Flash, Claude Haiku 4.5, Claude Sonnet 5) on accuracy against the ground truth set from feature 15. The vendors this spec ships with are the provisional default, not a settled choice; price is a tiebreak only, since the whole candidate set's spread is roughly $26 a month at this app's ceiling.
- [ ] If GLM (Zhipu AI) is ever chosen over its benchmark result, that is a deliberate jurisdiction decision for the engineer, since it moves resumes, work history, and locations outside the vendors spec 0009's notice currently names, not a call a benchmark result can make on its own.
- [ ] Feature 14's own scope note about the privacy notice's "not used to train models" claim is unchanged by this feature; this spec's own test calls carry no real user data. Verifying each vendor's training and retention terms before real profile data flows through `ai_scoring` in production remains feature 14's responsibility.
- [ ] Revisit pinning `ai_scoring` to the dated snapshot `claude-haiku-4-5-20251001` instead of the alias `claude-haiku-4-5` when feature 16's eval harness reports a pair falling outside its expected band that cannot be attributed to a prompt change or a ground truth change; that shape is what a silent alias repoint looks like from inside this system, and it is the concrete trigger to pin, not a vague "if it ever becomes a problem." Pinning has its own honest cost: a dated snapshot eventually retires, and nothing in this repo would warn you before a call to it started failing, which is why the alias plus the harness is the better default rather than a compromise.

## Rationale

Full reasoning, the vendor and model derivation, the pricing evidence, and references: see [rationale.md](rationale.md).
