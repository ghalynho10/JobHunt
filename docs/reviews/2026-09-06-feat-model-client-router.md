# Review, feat/model-client-router, 2026-09-06

**Reviewed by**: Claude Opus 5 (author model not recorded in the branch; reviewed on a different model per `/check review`)
**Scope**: 21 files, branch vs `main` (merge base `3a41ae5`, 12 commits)
**Verdict**: Blocked

## Summary

Feature 13 builds the AI router as specced: `callTier()` opens `ai.call_tier` as its literal first statement, hands the vendor call to `withUsageGate()` so a refusal structurally cannot reach a provider, and classifies a caught `generateObject` error into exactly one `failure()` from a fixed message catalogue. The design work is unusually careful, and the non-obvious claims in spec 0012 hold up against the installed packages (`temperature: undefined` really is dropped from the wire; `maxRetries: 0` really is honoured; all three AI SDK packages share one `@ai-sdk/provider` 4.0.10 / `@ai-sdk/provider-utils` 5.0.36).

One blocker: this branch adds two **required** `src/env.ts` variables and does not add them to `.github/workflows/ci.yml`, so both CI test jobs fail at env validation the moment a pull request opens. I reproduced it. Beyond that, the AC-3 import guard bans the harder bypass while leaving the easier one open, and the new integration test mutates a shipped `usage_cap` row from the parallel test project.

## Blockers

### 🔴 CI has neither new key, so both test jobs fail at env validation, `.github/workflows/ci.yml:84` and `:144`

**Problem**: `src/env.ts` now requires `OPENAI_API_KEY` and `GOOGLE_GENERATIVE_AI_API_KEY` as non-empty server strings, validated at module import. `.env*` is gitignored, so CI never has `.env.test`: the workflow passes every required value explicitly in each job's `env:` block. This branch changes neither block. `SKIP_ENV_VALIDATION` is set only for the build job (line 54), deliberately and correctly, so it does not cover the test jobs.

Reproduced locally by making the two keys read as absent (`emptyStringAsUndefined: true` turns an empty value into `undefined`, which is exactly CI's state):

```console
OPENAI_API_KEY="" GOOGLE_GENERATIVE_AI_API_KEY="" pnpm vitest run --project unit src/lib/ai/tiers.test.ts
→ Error: Invalid environment variables … ❯ src/env.ts:12 ❯ src/lib/ai/tiers.ts:7
```

The same import chain runs in the integration job. No pull request is open for this branch yet (`gh pr list --head feat/model-client-router` → empty), so CI has never run on it, and every local run passed only because `.env.test` holds both keys.

**Why it matters**: the pull request opens red on a failure that reads like a code defect and is not one, on a project whose merge gate is CI. Feature 11 hit this exact shape and its fix is the precedent sitting three lines away: `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` were added to both blocks (lines 92 and 153).

**Suggested fix**: add both keys to the unit job's `env:` block and the integration job's `env:` block with placeholder values, in the same style and with the same "shapes `src/env.ts` accepts and nothing here ever dials" reasoning already written above those blocks. Placeholders are sufficient and correct: the only tests that would dial a vendor are gated behind `TEST_LIVE_MODEL_CALLS_ENABLED`, which CI never sets.

## Major

### 🟠 Both keys need to exist in every Vercel environment before the preview build, and the spec's follow-up names only one, `docs/specs/0012-model-client-router/index.md:121`

**Problem**: Follow-up item 121 requires `OPENAI_API_KEY` in `.env.local` and all three Vercel environments before the pull request opens, and says nothing about `GOOGLE_GENERATIVE_AI_API_KEY`, which this branch makes equally required. Vercel builds run real env validation (only CI skips it), and `src/env.ts` is dereferenced while Next collects page data, so a missing value fails the preview build before any page renders.

**Why it matters**: this is the precise failure the 2026-09-04 reflex was written for, after feature 11's two Adzuna keys. Half a fix produces the same red check.

**Suggested fix**: set both keys in development, preview and production before opening the pull request, and correct the follow-up item to name both. `.env.local` already holds both locally, so only the Vercel side is outstanding.

### 🟠 The AC-3 guard bans the harder bypass and leaves the easier one open, `src/lib/ai/tiers.test.ts:107`

**Problem**: the source walk is sound in the ways I checked — it resolves to the real repo `src`, recurses the whole tree, excludes only `tiers.ts` and `*.test.ts?`, strips comments before matching, and carries a non-vacuity assertion (`files.length > 20`). But it matches only `from "@ai-sdk/…"`. A file that writes `import { generateObject } from "ai"` passes it completely, and that is the cheaper path to every outcome AC-3 exists to prevent:

- `LanguageModel` accepts a plain model-id string, which routes through `@ai-sdk/gateway` (present as a transitive dependency at 4.0.75). That is the Vercel AI Gateway path spec 0012's own Decision section explicitly overrides, because spec 0001 binds this project to direct provider packages so data reaches only the vendors the privacy notice names.
- Such a call site also skips `withUsageGate()`, so it spends real money outside the gate this feature exists to route everything through — "the one door" becomes documentation rather than structure.

The regex additionally misses `import "@ai-sdk/x"` (side-effect form, no `from`), `await import("@ai-sdk/x")` and `require("@ai-sdk/x")`. Nothing else covers this: `eslint.config.mjs:53` restricts only `src/lib/supabase/secret`.

**Why it matters**: the guard's own failure message claims more than the check delivers ("A caller that imports one directly can bypass tiers.ts's fixed vendor, model and generation parameters"), and features 14 and 17 are about to be written against this module by authors who will read that message as the enforced boundary.

**Suggested fix**: extend the offender match to the `"ai"` package itself, allowing `src/lib/ai/client.ts` alongside `tiers.ts`, and widen the pattern to cover the side-effect and dynamic forms. Better still, mirror the `secret.ts` precedent with an ESLint `no-restricted-imports` group so the violation is caught at author time rather than at test time; the test then locks the rule rather than being the only thing enforcing it.

### 🟠 The zeroed-cap test mutates a shipped `usage_cap` row from the parallel project, `test/integration/model-client-router.test.ts:52`

**Problem**: the test sets `cap_value = 0` for **all** `ai_scoring` rows, globally, then restores them in a `finally`. It lives in `test/integration/`, whose files Vitest runs in parallel. `test/integration/model-client-router-live.test.ts` calls `ai_scoring` and sits in the same project, so with `TEST_LIVE_MODEL_CALLS_ENABLED=true` the two files race: the live scoring call can land inside the zeroed window and fail with "Expected the call to be allowed, was refused". The 2026-09-06 live run recorded in `verify.md` used `-t "real vendor"`, which filters this test out, so the race was never exercised.

This is the class of failure `test/integration-serial/` was built for — `vitest.config.mts` documents a shared global row reproducibly breaking an unrelated file — and it departs from the pattern `test/integration/usage-gating.test.ts` established, which inserts and deletes its own synthetic `TEST_CALL_TYPE` rows and never touches a shipped call type. `callTier()` hardcodes tier → call type, so the synthetic-row trick is not available here, which is exactly why the serial project is the right home.

Two smaller problems ride along in the restore at lines 76-82: the values `500` / `1320` / `40000` are hardcoded, duplicating the migration, so changing the migration silently leaves a developer's stack restored to stale caps; and the `case` has no `else`, so any future `ai_scoring` row outside those three (scope, period) pairs would be set to `null` against a `not null` column.

**Why it matters**: a false failure in the one test run that spends real vendor money is the worst place to have flakiness, because the natural reading is "the vendor is broken", not "another test file zeroed my budget".

**Suggested fix**: move the file to `test/integration-serial/`, where `groupOrder: 1` plus `fileParallelism: false` make the isolation structural. Derive the restore values from a read taken before the update rather than retyping the migration's numbers.

## Minor

### 🟡 A truncated response is reported as a malformed one, `src/lib/ai/client.ts:130`

**Problem**: `classify()` maps anything matching `NoObjectGeneratedError.isInstance` to `response_malformed`. In the installed `ai` 7.0.93 that class also covers `finishReason: 'length'`, i.e. output truncated by `maxOutputTokens`: there is no truncation-specific error, the truncated JSON simply fails to parse and throws the same class (`node_modules/ai/dist/index.js:13899`), with `finishReason` attached to the error object. For `ai_scoring` this is not hypothetical — `maxOutputTokens: 2048` has to cover GPT-5.6 Luna's hidden reasoning tokens at `reasoningEffort: "medium"`, and spec 0012 itself calls that output figure "less certain than the rest".

**Why it matters**: binding rule 3 fingerprints Sentry issues by kind, so a ceiling that is simply too low would group with genuine vendor schema failures under one issue and one fixed message ("The model's answer didn't come back in the shape we expected"), pointing the operator at the model instead of at a number in `tiers.ts`. It would also survive a `maxOutputTokens` bump silently.

**Suggested fix**: read `finishReason === "length"` off the caught error and record it — at minimum as a span attribute beside `stage: "vendor"`, so the two are separable in a query without changing the `FailureKind` union.

### 🟡 The unit test's `withUsageGate` mock re-implements the helper it stands in for, `src/lib/ai/client.test.ts:22`

**Problem**: the mock reproduces the real helper's success wrapping (`{ ok: true, value: { allowed: true, value } }`). If `withUsageGate()`'s own contract ever changed shape, these tests would keep passing on the old one — the shape the project's testing rule ("never a mock encoding the same assumption as the code under test") is aimed at. The file argues the case honestly and the integration file does cover the real helper, so this is a judgment call rather than a violation.

**Suggested fix**: leave it if the tradeoff is deliberate, but consider mocking one level lower (`checkUsageGate`) so the real `withUsageGate()` runs, which costs nothing and removes the duplicated assumption.

### 🟡 The privacy registry entries are written in the present tense a feature early, `src/features/legal/recipients.ts:118`

**Problem**: the two new entries say OpenAI and Google "receive a listing and the profile being scored against it" and the check tier's copy of it. As of this branch nothing sends any profile anywhere — feature 14 is unbuilt — so `/privacy` describes a data flow that does not exist yet. Separately, `src/features/legal/privacy-notice.tsx:80` states "It is not used to train machine learning models, by anyone", and the Gemini API's free tier does use submitted data to improve products, so that sentence's truth now depends on which billing tier the new Google key belongs to.

**Why it matters**: `src/features/legal/AGENTS.md` is explicit that one false sentence on these pages costs the credibility of the rest, and it forbids describing a control that does not exist. This is that rule pointed the other way. Both halves are already owned in writing (spec 0012 Follow-up line 118, and feature 14's scope note), so this is a flag rather than a new obligation — AC-9 does mandate the entries now.

**Suggested fix**: no change required if the AC-9 timing is deliberate; consider a short clause in `receives` marking the flow as beginning with fit scoring, and confirm the Google key is on a paid tier before feature 14 sends real profile data.

## Nits

- ⚪ `src/lib/ai/failures.ts:19`, `AI_ROUTER_FAILURES` carries no doc comment of its own; the block above it documents the (unexported) `AiRouterFailureShape` interface, and every export is meant to carry one.
- ⚪ `src/lib/ai/tiers.ts:53`, `providerOptions` is typed `Record<string, Record<string, string>>`, narrower than the SDK's `JSONObject`; the next provider option that is a number, boolean or nested object (Google's `thinkingConfig`, for one) will not type-check without touching this interface.
- ⚪ `.env.test.example:59`, `TEST_LIVE_MODEL_CALLS_ENABLED` is described in prose but never given a key line, unlike `TEST_DIRECT_DB_ENABLED`; someone wanting the live run has to read the paragraph to learn the spelling.
- ⚪ `test/integration/model-client-router.test.ts:53`, if the process dies between the update and the `finally`, the developer's local stack keeps zeroed `ai_scoring` caps until the next `pnpm db:reset`, with no signal saying why every later run refuses.

## Strengths

- The gate is structural, not documented: routing through `withUsageGate()` rather than branching on `checkUsageGate()` by hand means no path through `callTier()` reaches a vendor on a refusal, and the integration test asserts `generateObject` was never called rather than asserting the return value alone.
- Spec 0012's non-obvious runtime claims survive verification against the installed packages: `temperature: undefined` is passed through and then dropped by `JSON.stringify`, never coerced to `0` (`ai/dist/index.js:2058`, `@ai-sdk/google/dist/index.js:7487`); `maxRetries: 0` short-circuits the retry loop and rethrows the raw error, so `NoObjectGeneratedError.isInstance` is not defeated by a `RetryError` wrapper; and `ai` 7.0.93, `@ai-sdk/openai` 4.0.59 and `@ai-sdk/google` 4.0.64 all resolve to a single `@ai-sdk/provider` 4.0.10 and `@ai-sdk/provider-utils` 5.0.36, which is the compatibility check build plan step 1 asked for and it genuinely holds.
- `timeoutMs` stored as a number with the `AbortSignal` built per call is a real trap avoided, and the comment says why rather than what.
- `maxRetries: 0` is tied to the dollar derivation in both the type (`readonly maxRetries: 0`) and a test, so raising it cannot happen quietly.
- The failure catalogue keeps vendor text off the caller, and the test asserts the negative directly (`expect(result.message).not.toMatch(/ECONNREFUSED/)`).
- Both source-walking guards carry non-vacuity assertions, which is the habit that keeps this kind of test from passing on an empty set.

## Test coverage

Strong for a feature of this size: 930 unit tests pass locally (re-run during this review), `classify()` is driven directly with constructed error instances on both branches, `callTier()`'s allowed and failed paths are both asserted end to end without touching a vendor, the gate refusal and the no-session path are proved against the real local stack, and the live vendor round trip exists but fails closed by default with its flag parser tested across true, false and malformed spellings.

Three gaps, none of which I would block on:

- AC-7's span-first ordering and the `tier` / `stage: "vendor"` attributes are unasserted. This matches the project's existing convention — no span anywhere has an ordering test — so it is consistent rather than novel, and `verify.md` records the code read honestly.
- The truncation branch (Minor above) has no test, which is what lets the classification question stay invisible.
- The AC-3 guard's own coverage is the gap described in the second Major above: the test passes today and would keep passing through the bypass that actually matters.
