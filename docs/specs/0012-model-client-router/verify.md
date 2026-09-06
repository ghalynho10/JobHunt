# Verify: model client router · spec 0012 · updated 2026-09-06

_Steps derived from spec 0012 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

None. This feature has no UI surface; every acceptance criterion is proved through code and the database.

## Commands

- [x] `pnpm typecheck` → passes → all ACs
- [x] `pnpm lint` → passes → all ACs
- [x] `pnpm test` → all pass, including `src/lib/ai/tiers.test.ts` and `src/lib/ai/client.test.ts` → AC-1, AC-3, AC-5, AC-6
- [x] `pnpm test:integration` → all pass, `test/integration/model-client-router.test.ts` included, the two live vendor tests in `test/integration/model-client-router-live.test.ts` skipped → AC-4, AC-8
- [ ] `TEST_LIVE_MODEL_CALLS_ENABLED=true pnpm test:integration -t "real vendor"` with real `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` in `.env.test` → both tiers return a value matching the caller's schema → AC-1, AC-2. **Not run on 2026-09-06**: spends real vendor money and `.env.test` still holds placeholder keys; needs the engineer's explicit go ahead before either changes.
- [x] `select call_type, scope, period, cap_value from public.usage_cap where call_type in ('ai_scoring','ai_check')` against the local stack → six rows at `500` / `1320` / `40000` → AC-8
- [x] `grep -rn "from \"@ai-sdk/" src --include=*.ts --include=*.tsx | grep -v '.test.ts' | grep -v 'src/lib/ai/tiers.ts'` → no output → AC-3

## Acceptance-criteria coverage

- AC-1 (two tiers, two vendors, checked by reading the map) — met. `src/lib/ai/tiers.test.ts`, "maps ai_scoring and ai_check to two different vendors", re-run 2026-09-06 and passing; the live vendor command above remains the real-world confirmation and is still unrun.
- AC-2 (`callTier()` returns the schema's parsed type inside a `Result`) — met. **Gap closed during `/check verify` on 2026-09-06**: no committed, money-free test previously exercised `callTier()`'s allowed-and-successful path end to end; a throwaway integration test (real fixture user, real session, real `checkUsageGate()` call against the local stack, `generateObject` mocked to resolve) proved `callTier("ai_scoring", schema, prompt, { cookieAdapter })` returns `{ ok: true, value: { allowed: true, value: <parsed object> } }` matching the schema, then was deleted (verify owns no durable files). **This should become a permanent test** (`/test model client router`): today only the gated, unrun live vendor test exercises this path in the committed suite.
- AC-3 (no caller supplies vendor, model, or generation parameter) — met. `src/lib/ai/tiers.test.ts`, "imports no @ai-sdk/ package outside tiers.ts"; the grep command above run by hand on 2026-09-06, no output.
- AC-4 (`checkUsageGate()` runs before dispatch; a refusal is a decided outcome, never a `Failure`) — met. `test/integration/model-client-router.test.ts`, both describe blocks, re-run 2026-09-06 against the real local stack; the same run's throwaway test (see AC-2) additionally confirms the allowed path reaches the vendor.
- AC-5 (a provider throw/timeout becomes `external_service_failed`) — met. `src/lib/ai/client.test.ts`, "reads any other thrown value as external_service_failed".
- AC-6 (a schema mismatch becomes `response_malformed`) — met. `src/lib/ai/client.test.ts`, "reads a NoObjectGeneratedError as response_malformed".
- AC-7 (the named span opens first) — met. Confirmed 2026-09-06 by direct read of `src/lib/ai/client.ts`: `return Sentry.startSpan(...)` is the function's only statement, nothing precedes it; `docs/observability/spans.md`'s `ai.call_tier` row matches. Not independently re-proved by a forced-outage test in this feature's own suite (matching how `search.run`'s ordering is proved by code review plus the registry rather than a dedicated span-ordering test).
- AC-8 (six seeded `usage_cap` rows) — met. The `select` command above, re-run 2026-09-06 against the local stack: six rows at the correct values; also exercised indirectly by `model-client-router.test.ts`'s zeroed-cap test.
- AC-9 (`DATA_RECIPIENTS` gains `openai` and `google-ai`; the privacy watchlist drops OpenAI, keeps Anthropic) — met. `src/features/legal/recipients.test.ts`, "names the eight companies data reaches today"; `src/app/(marketing)/privacy/page.test.ts`, "names no company the registry does not hold"; both re-run 2026-09-06.
- AC-10 (`OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` required in `src/env.ts`, each provider built with the explicit key) — met. **Enforcement proved, not assumed, on 2026-09-06**: importing `src/env.ts` with `OPENAI_API_KEY` blank throws `Invalid environment variables` naming that exact key; `pnpm build` succeeds with real values present. `src/lib/ai/tiers.ts` passes `env.OPENAI_API_KEY` / `env.GOOGLE_GENERATIVE_AI_API_KEY` explicitly to `createOpenAI`/`createGoogle`, never left to the package's implicit `process.env` read.
