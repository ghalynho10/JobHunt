# Verify: model client router · spec 0012 · updated 2026-09-06

_Steps derived from spec 0012 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

None. This feature has no UI surface; every acceptance criterion is proved through code and the database.

## Commands

- [ ] `pnpm typecheck` → passes → all ACs
- [ ] `pnpm lint` → passes → all ACs
- [ ] `pnpm test` → all pass, including `src/lib/ai/tiers.test.ts` and `src/lib/ai/client.test.ts` → AC-1, AC-3, AC-5, AC-6
- [ ] `pnpm test:integration` → all pass, `test/integration/model-client-router.test.ts` included, the two live vendor tests in `test/integration/model-client-router-live.test.ts` skipped → AC-4, AC-8
- [ ] `TEST_LIVE_MODEL_CALLS_ENABLED=true pnpm test:integration -t "real vendor"` with real `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` in `.env.test` → both tiers return a value matching the caller's schema → AC-1, AC-2
- [ ] `select call_type, scope, period, cap_value from public.usage_cap where call_type in ('ai_scoring','ai_check')` against the local stack → six rows at `500` / `1320` / `40000` → AC-8
- [ ] `grep -rn "from \"@ai-sdk/" src --include=*.ts --include=*.tsx | grep -v '.test.ts' | grep -v 'src/lib/ai/tiers.ts'` → no output → AC-3

## Acceptance-criteria coverage

- AC-1 (two tiers, two vendors, checked by reading the map) — `src/lib/ai/tiers.test.ts`, "maps ai_scoring and ai_check to two different vendors"; the live vendor command above is the real-world confirmation.
- AC-2 (`callTier()` returns the schema's parsed type inside a `Result`) — the live vendor command above; `src/lib/ai/client.ts`'s return type has no plain-text path.
- AC-3 (no caller supplies vendor, model, or generation parameter) — `src/lib/ai/tiers.test.ts`, "imports no @ai-sdk/ package outside tiers.ts"; the grep command above is the same check run by hand.
- AC-4 (`checkUsageGate()` runs before dispatch; a refusal is a decided outcome, never a `Failure`) — `test/integration/model-client-router.test.ts`, both describe blocks.
- AC-5 (a provider throw/timeout becomes `external_service_failed`) — `src/lib/ai/client.test.ts`, "reads any other thrown value as external_service_failed".
- AC-6 (a schema mismatch becomes `response_malformed`) — `src/lib/ai/client.test.ts`, "reads a NoObjectGeneratedError as response_malformed".
- AC-7 (the named span opens first) — `docs/observability/spans.md`'s `ai.call_tier` row; not independently re-proved by a forced-outage test in this feature's own suite (matching how `search.run`'s ordering is proved by code review plus the registry rather than a dedicated span-ordering test).
- AC-8 (six seeded `usage_cap` rows) — the `select` command above, confirmed live against the local stack during this build; also exercised indirectly by `model-client-router.test.ts`'s zeroed-cap test.
- AC-9 (`DATA_RECIPIENTS` gains `openai` and `google-ai`; the privacy watchlist drops OpenAI, keeps Anthropic) — `src/features/legal/recipients.test.ts`, "names the eight companies data reaches today"; `src/app/(marketing)/privacy/page.test.ts`, "names no company the registry does not hold".
- AC-10 (`OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` required in `src/env.ts`, each provider built with the explicit key) — `pnpm build` failing without them in `.env.local`/Vercel is the enforcement; `src/lib/ai/tiers.ts` passes `env.OPENAI_API_KEY` / `env.GOOGLE_GENERATIVE_AI_API_KEY` explicitly to `createOpenAI`/`createGoogle`, never left to the package's implicit `process.env` read.
