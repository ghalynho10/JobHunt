# Review (round 2), feat/model-client-router, 2026-09-06

**Reviewed by**: Claude Opus 5 (round 1 was a different Opus 5 instance; author model not recorded in the branch)
**Scope**: 24 files, branch vs `main` (merge base `3a41ae5`, 20 commits), re-review after six round-1 findings
**Verdict**: Changes requested

## Summary

Every one of round 1's three actionable findings is genuinely fixed, and I re-proved each one rather than reading the commit messages: the two env keys are in both CI job `env:` blocks, the AC-3 source walk now fails on three import forms I broke it with on purpose, and the cap-zeroing test really does live in a project that cannot run beside the live-vendor test. The truncation minor is fixed and, unusually, the fix is grounded in the installed SDK rather than in a plausible story about it. Both suites pass for real (932 unit, 125 integration + 2 correctly skipped), as do `typecheck`, `lint` and `format:check`.

Two new problems arrived with the fixes, and both are the same shape: a correction that is right in intent and slightly wrong in reach. The new ESLint rule bans `"ai"` using a pattern matcher that treats it as a *path segment*, so it now forbids `@/lib/ai/client` — the exact import its own error message tells you to write, and the one feature 14 exists to make. And the privacy page, whose registry this branch grows from six entries to eight, still opens that list with the words "Five other companies" and closes it with "beyond the five companies named above".

## Major

### 🟠 The new ESLint rule bans the router it tells you to import, `eslint.config.mjs:74` and `:115`

**Problem**: both new `patterns` groups are `["@ai-sdk/*", "ai"]`. `no-restricted-imports`'s `patterns.group` is matched with gitignore-style path semantics, where a slash-free pattern matches a **segment at any depth**, not an exact module specifier. So `"ai"` matches every import path containing a segment named `ai`.

Reproduced against the real config (temporary files, since removed):

```console
$ npx eslint src/features/__revtmp/d-imports-router.ts
  1:1  error  '@/lib/ai/client' import is restricted from being used by a pattern.
             Spec 0012, AC-3: … Call callTier() from src/lib/ai/client.ts instead …
```

The same error fires for `../../lib/ai/client`, `@/lib/ai/tiers`, and `@/features/scoring/ai/prompt`. It does **not** fire for `@/lib/aitools`, which confirms the mechanism is segment matching rather than substring matching. The rule is live for both blocks: a file under `src/app` hits it too.

`pnpm lint` passes today, so nothing is broken right now — I checked. It passes only because no file under `src/` outside `src/lib/ai/` imports the router yet.

**Why it matters**: feature 14's entire job is to call `callTier()` from `src/features/`. The first line of that feature will fail `pnpm lint`, which is a CI gate, with a message instructing the author to write the line they just wrote. The likely resolutions under time pressure are an `eslint-disable` comment on the router import (which normalises disabling the rule that protects the vendor boundary) or widening the `ignores` list until the rule stops firing. Either one costs more than the rule buys. It also silently forbids `src/features/<x>/ai/` as a directory name anywhere in the tree.

**Suggested fix**: `"ai"` is an exact module name, so it belongs in `paths`, not `patterns`. Move it, and add `"ai/*"` to the pattern group to keep subpath coverage. I verified this exact shape:

```
paths:    [{ name: "ai", message: … }]
patterns: [{ group: ["@ai-sdk/*", "ai/*"], message: … }]
```

fires on `ai`, `ai/internal`, `@ai-sdk/openai` and `@ai-sdk/openai/internal`, and leaves `@/lib/ai/client` and `../lib/ai/tiers` alone. Note that `paths` entries are per-config-object like `patterns`, so the same merge reasoning already written at `eslint.config.mjs:50` applies to them and the `src/app` block still needs its own copy.

### 🟠 `/privacy` says five companies and renders eight, `src/features/legal/privacy-notice.tsx:65` and `:79`

**Problem**: `RECIPIENTS_INTRO` reads "**Five** other companies are involved in running this service", and the plain-negatives list asserts data "is not shared with data brokers or any other party beyond the **five** companies named above". Directly beneath the first sentence, `privacy-notice.tsx:188` maps `DATA_RECIPIENTS` and renders one `<dt>`/`<dd>` pair per entry. This branch takes that array from six entries to eight (`recipients.test.ts` was updated in the same commit from "names the six companies" to "names the eight companies"). The page now names eight companies between two sentences that say five.

This was already off by one at the merge base (six entries, "Five"), left behind when feature 11 added Adzuna. `privacy-notice.tsx` is untouched on this branch. But this branch is the one that lands the eight, and it widens the gap from one to three.

**Why it matters**: `src/features/legal/AGENTS.md` states the rule this breaks in two places — "The page renders the registry; it never restates it", and "one false sentence costs the credibility of all the rest" — and cites the precedent by name: "`hero-section.tsx` carried a written count beside a list that had moved on." `recipients.ts:5-9` repeats the same warning at the top of the file this branch edits. The second sentence is worse than the first, because it is not merely a stale count: it is a positive assurance about who data is *not* shared with, and it excludes three of the companies the same page names. No test catches it — I grepped; `page.test.ts`'s guard checks that no *unlisted* company is named, which is the opposite direction, and nothing asserts the count.

**Suggested fix**: drop the numeral from both sentences ("The other companies involved…", "…beyond the companies named above"), which removes the restatement rather than resynchronising it and is the shape `recipients.ts`'s own doc comment argues for. If a count is genuinely wanted in the prose, derive it from `DATA_RECIPIENTS.length` at render. Either way this belongs in this branch: it is the change that makes the sentence off by three.

## Minor

### 🟡 The `truncated` attribute the fix rests on is not in the span registry, `docs/observability/spans.md:33`

**Problem**: the `ai.call_tier` row documents the `tier` attribute and, at length, why a caught vendor error carries `stage: "vendor"`. It says nothing about `truncated`. That attribute is the entire deliverable of the round-1 truncation fix, and the only thing that makes a blown `maxOutputTokens` distinguishable from a genuine schema mismatch.

**Why it matters**: AGENTS.md's binding rule 3 makes `spans.md` the place a span's queryable surface is recorded, and the reason `stage` is written up there at all is that an operator writing an alert has no other way to learn it exists. `truncated` was added for exactly that audience and is invisible to it. `verify.md`'s AC-6 entry describes the attribute well, but a verify checklist is not where anyone looks when building a Sentry query.

**Suggested fix**: one clause on the existing row, alongside the `stage` sentence, naming `truncated: true` and what it separates.

### 🟡 The three AI packages are the only floating runtime versions, `package.json:26`, `:27`, `:31`

**Problem**: `@ai-sdk/google": "^4.0.64"`, `"@ai-sdk/openai": "^4.0.59"` and `"ai": "^7.0.93"` carry caret ranges. Every other dependency whose behaviour this project reasons about is pinned exactly: `@sentry/nextjs` 10.70.0, `@supabase/ssr` 0.12.4, `@supabase/supabase-js` 2.112.3, `@t3-oss/env-nextjs` 0.13.11, `next` 16.3.1, `react` 19.2.8, `zod` 4.4.3. (`server-only` and `tailwind-variants` do float, so the convention is not absolute — but neither carries load-bearing runtime claims.)

**Why it matters**: three claims this feature is built on are version-specific facts about these packages, verified by reading `node_modules`: `maxRetries: 0` short-circuits rather than wrapping in a `RetryError`; `NoObjectGeneratedError` exposes `finishReason` and the SDK populates it at the parse-failure throw sites; and all three packages resolve to a single `@ai-sdk/provider`. A caret range permits a minor bump that changes any of them. `--frozen-lockfile` protects CI, so this is not a live break; it is a gap between how the version is pinned and how confidently the code depends on it.

**Suggested fix**: pin all three exactly, matching the other runtime dependencies.

**REJECTED by the engineer, 2026-09-06, on a false premise.** The finding's own claim, "every other dependency whose behaviour this project reasons about is pinned exactly," does not hold: counted directly from `package.json`, 19 of the repo's 30 dependencies use `^`, not 2. That list includes `eslint`, `typescript`, `prettier`, `pg`, `tailwindcss`, `server-only`, `tailwind-variants`, and every `@types/*` package, several of which this project's own tooling and type checking depend on just as concretely as `client.ts` depends on the three AI packages. The caret range is this project's normal convention, not an exception the three AI packages fall into. Pinning them would also directly contradict spec 0012's own Build plan step 1: "Add `@ai-sdk/openai`, `@ai-sdk/google`, and `ai` to `package.json`, none pinned, matching this spec's original style." Recorded here so it is not re-raised on a future review.

### 🟡 (Round 1, carried, deliberately accepted twice now) The `withUsageGate` mock re-implements the helper, `src/lib/ai/client.test.ts:50`

**CONFIRMED ACCEPTED by the engineer, 2026-09-06**, for the second review running. No further action; recorded so a third review does not treat it as unaddressed.

Left as-is on purpose, and I agree with leaving it. Recording it so it is not re-raised as new next time: the mock reproduces `{ ok: true, value: { allowed: true, value } }`, the real helper's own success shape, so a change to that contract would not fail these tests. The file argues the tradeoff in a comment, `test/integration/model-client-router.test.ts` and `test/integration-serial/model-client-router-usage-cap.test.ts` both drive the real helper against the real stack, and `with-usage-gate.test.ts` proves the helper itself. Mocking `checkUsageGate` one level lower would still be free and would remove the duplicated assumption, but this is a judgment call, not a defect.

## Nits

- ⚪ `src/lib/ai/tiers.test.ts:129`, the source walk's `PACKAGE` alternation misses an `ai` subpath: I added a file importing from `"ai/internal"` and all 7 tests passed. The ESLint rule does catch it today, so the pair is complete — but if the Major above is fixed by narrowing the ESLint pattern, confirm `ai/*` stays in the group, because this walk will not cover it.
- ⚪ `src/lib/ai/client.test.ts:261`, "does not mark an ordinary schema mismatch as truncated" asserts only a negative. It is not vacuous today (I checked the `getActiveSpan` mock genuinely returns `fakeSpan` there), but a regression that stopped `Sentry.getActiveSpan()` being called at all would leave it green. One `expect(fakeSpan.setAttribute).toHaveBeenCalledWith("stage", "vendor")` line would make it self-proving, the habit `docs/reflexes.md` records twice.
- ⚪ `docs/specs/0012-model-client-router/index.md:88` (build plan step 6) still describes the guard as "no file under `src/` other than `src/lib/ai/tiers.ts` imports an `@ai-sdk/` package". Step 5 was corrected in `3e2be76` for a similar drift; step 6 now understates the guard on both axes (it also allows `client.ts`, and also bans `ai`).
- ⚪ `src/lib/ai/failures.ts:19`, `AI_ROUTER_FAILURES` still carries no doc comment of its own (round-1 nit, unfixed). The block above documents the unexported `AiRouterFailureShape`.
- ⚪ `src/lib/ai/tiers.ts:53`, `providerOptions` is still typed `Record<string, Record<string, string>>` (round-1 nit, unfixed). Google's `thinkingConfig` is the shape that will not fit.
- ⚪ `.env.test.example:59`, `TEST_LIVE_MODEL_CALLS_ENABLED` is still described in prose with no key line (round-1 nit, unfixed), unlike `TEST_DIRECT_DB_ENABLED` at line 87.
- ⚪ `docs/specs/0012-model-client-router/index.md:121`, the corrected Vercel-env follow-up is right and remains unticked, correctly. I cannot verify from here that both keys are actually set in all three Vercel environments; that check is still owed before the PR opens, per the 2026-09-04 reflex.

## Round-1 findings, one by one

| # | Round-1 finding | Status | Evidence I re-took |
|---|---|---|---|
| 1 | 🔴 CI missing both env keys | **Resolved** | `.github/workflows/ci.yml:94-95` (unit job) and `:157-158` (integration job), both present with placeholder values in the documented style. Mechanism re-confirmed load-bearing: `OPENAI_API_KEY="" GOOGLE_GENERATIVE_AI_API_KEY="" npx vitest run --project unit src/lib/ai/tiers.test.ts` → `Invalid environment variables … src/env.ts:12`. |
| 2 | 🟠 Spec follow-up named one key | **Resolved** | `index.md:121` now reads "**both** `OPENAI_API_KEY` **and** `GOOGLE_GENERATIVE_AI_API_KEY`", with the correction and its reason recorded inline. The Vercel-side action itself remains unverifiable from here (see nit above). |
| 3 | 🟠 AC-3 guard let plain `"ai"` through | **Resolved, but the ESLint half introduced a new Major** | Broke the widened walk three ways on purpose, each in a temp file under `src/features/`: bare `from "ai"` → 1 failed with the intended message; `import "@ai-sdk/openai"` → 1 failed; `await import("ai")` → 1 failed. All temp files removed, `git status` clean. `require()` form is covered by the same pattern set. The ESLint rule fires correctly on real offenders too — but see the Major above for what else it fires on. |
| 4 | 🟠 Racy `usage_cap` test in the parallel project | **Resolved** | File is at `test/integration-serial/model-client-router-usage-cap.test.ts`; `vitest.config.mts:144` includes `test/integration-serial/**/*.test.ts` with `sequence.groupOrder: 1` and `fileParallelism: false`, so it cannot run beside `test/integration/model-client-router-live.test.ts` nor beside its two sibling serial files. The restore now `select`s `scope, period, cap_value` before zeroing and replays each captured row by `(call_type, scope, period)` — which is the table's actual primary key, confirmed at `supabase/migrations/20260902120000_usage_gating.sql`. Both sub-problems are gone: no hardcoded `500/1320/40000`, and no `case` that could write `null` into a `not null` column. The non-empty precondition throws before any mutation. |
| 5 | 🟡 Truncation misclassified as malformed | **Resolved** | `client.ts:125-130` sets `truncated: true` when `NoObjectGeneratedError.isInstance(error) && error.finishReason === "length"`, with no new `FailureKind`. Grounded in the installed SDK, not assumed: `finishReason` is a real `readonly` field on the class (`node_modules/ai/dist/index.d.ts:7066`) and the SDK passes `context.finishReason` at the parse-failure throw sites (`node_modules/ai/dist/index.js:4010`, `:4078`). Two tests cover both directions. The `Proxy`-based `@sentry/nextjs` mock is sound: it forwards every property to the real module and intercepts only `getActiveSpan`, so `startSpan` stays real and no export is dropped. I also traced that the attribute lands on the right span — `withUsageGate` awaits `checkUsageGate()` (which opens and closes `usage_gate.check`) to completion *before* invoking its thunk, so the active span inside the `catch` is `ai.call_tier`, as `spans.md` claims. Follow-on: the attribute is unregistered (Minor above). |
| 6 | 🟡 `withUsageGate` mock re-implements the helper | **Deliberately accepted, not a defect** | See the Minor above. |
| 7 | 🟡 Privacy copy asserted a flow that does not exist | **Resolved as written, but the surrounding prose is now worse** | `recipients.ts:134` and `:148` both read `receives: "nothing yet"`, with `why` in the plain "It is…" register of every neighbouring entry and no `spec 0012` / `ai_scoring` jargon. I read the rendered shape too: `privacy-notice.tsx:188` renders `Receives {receives}. {why}`, so the page reads "Receives nothing yet. It is configured for a scoring feature this app has not built yet…", which is accurate and reads naturally. The `NEVER` clause "not used to train machine learning models, by anyone" is true while both entries receive nothing, so the Gemini free-tier concern is correctly deferred to feature 14. The count sentences three lines away are the new Major. |

## Strengths

- The round-1 fixes were each made in their own commit with the reason written into the code rather than only into the commit message, and the comments are specific enough to survive: `eslint.config.mjs:50-55` explains the flat-config merge hazard precisely, and it is right — I confirmed the merged `src/app` block still errors on `@/lib/supabase/secret`, so the secret-key protection was not silently replaced.
- The restore-by-read rewrite in the moved test is a strictly better fix than the one round 1 suggested, and the file says why in a comment that names both defects it replaces.
- The truncation fix resisted the obvious move of adding a `FailureKind`, correctly identified that as a spec-level decision, and shipped the queryable signal instead. That is the right call and the reasoning is recorded in three places.
- `verify.md` is honest about what was proved by a test versus by a code read (AC-7) versus by a one-off throwaway that was then deleted (AC-2), and says which permanent test now covers each.
- The `Proxy` mock over `@sentry/nextjs` is a genuinely good piece of test engineering, and the comment records the empirical failure that motivated it rather than asserting it was necessary.

## Test coverage

Both suites run for real during this review: `pnpm test` → 73 files, 932 tests, all passing. `pnpm test:integration` → 20 files, 125 passing, 2 skipped (the live-vendor pair, correctly fail-closed with `TEST_LIVE_MODEL_CALLS_ENABLED` unset). `pnpm typecheck`, `pnpm lint` and `pnpm format:check` all pass.

New coverage since round 1 is real and I verified it is not vacuous: the AC-3 walk fails on three constructed import forms, and the two truncation tests drive a genuinely constructed `NoObjectGeneratedError` with each `finishReason` rather than a stub.

Two gaps remain, neither blocking:

- Nothing tests the ESLint rules themselves. That is consistent with the repo (no existing rule has a test), and `tiers.test.ts` is the running check for AC-3 — but it is why the over-broad `"ai"` pattern shipped green. A single fixture file that must lint *clean* while importing `@/lib/ai/client` would have caught it.
- Nothing guards the company count on `/privacy`. The existing `notYetRecipients` test only catches naming a company the registry lacks, which is the opposite failure to the one the page now has.
