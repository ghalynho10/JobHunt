# 0019. Cross vendor self check, verify checklist

Run by `/check verify` after `/develop`. Every step says what it costs. Check the exit status of any command whose result is being reported, and never append `|| echo` to a check, because `||` fires on a bad path exactly as it fires on a clean result. Read `usage_gate_counter` through `test/helpers/database.ts` or `psql`, never through the Supabase Data API (no row level security policy exists on that table, spec 0011), and make any counter move on purpose once before trusting a "did not move" reading.

## Commands

- [ ] `pnpm test` **[free]** → green, including `check.ts`'s unit tests, the extended `score-listings.test.ts`, and `page.test.ts` → **AC-1** through **AC-13**
- [ ] `pnpm lint`, `pnpm format:check`, `pnpm typecheck` **[free]** → all clean
- [ ] Read `rubric.ts` and `check.ts` **[free]** → `buildScoringPrompt()` and `checkFitScore()`'s prompt builder both call the same exported `buildListingBlock()`, neither reimplements the title/company/location/description block independently → **AC-1**
- [ ] `git grep -n "clear synonym" src/features/scoring` **[free]** → the grounding criterion wording exists exactly once as a shared constant, read from both `rubric.ts`'s schema description and `check.ts`'s `CHECK_SYSTEM_PROMPT` → **AC-2**
- [ ] Read `check.ts`'s post parse filter and `rubric.ts`'s `normalizeFitScore()` **[free]** → the filter calls the same normalization function rather than a second, independently written comparison → **AC-3**
- [ ] Read `tiers.ts` **[free]** → `ai_check.timeoutMs` is a distinct value from `ai_scoring.timeoutMs` (no longer both 30000), and a comment or the Follow-up entry below names the live measurement it came from → **AC-6**
- [ ] Read `docs/observability/spans.md`'s `scoring.score_listings` row **[free]** → it names all four new attributes (`checked`, `checkSkippedEmpty`, `flagged`, `checkUnverifiable`) and states the `scored = checked + checkSkippedEmpty + checkUnverifiable` identity → **AC-10**
- [ ] `git diff main -- src/lib/env.ts src/features/legal/recipients.test.ts` **[free]** → no output. This feature adds no new environment variable and no new `DATA_RECIPIENTS` entry, since `GOOGLE_GENERATIVE_AI_API_KEY` and the `google-ai` recipient already exist (spec 0012) → Security model, Configuration required

## Behavioural, free (constructed inputs, no vendor call)

- [ ] Unit test: a constructed `ai_check` response naming a skill absent from the claimed `matchedSkills` list is filtered out before it reaches `ungroundedSkills` **[free]** → **AC-3**
- [ ] Unit test: a listing whose score returns `matchedSkills: []` never dispatches `checkFitScore()`, and the batch span records it under `checkSkippedEmpty`, not `checked` **[free]** → **AC-4**, **AC-10**
- [ ] Unit test: a listing whose score is refused or fails never dispatches `checkFitScore()` **[free]** → **AC-5**
- [ ] Unit test: a constructed `ai_check` vendor error and a zeroed `ai_check` `usage_cap` row (test only) both resolve to the AC-7 unverifiable state on the affected card, with the displayed matched skills and reasoning unchanged **[free]** → **AC-7**, **AC-8**, **AC-9**
- [ ] Unit test: a listing whose check flags a skill renders `COPY-9` naming it, drops it from the displayed matched list, and renders `COPY-11` above a `reasoning` string that is byte for byte identical to the score's own raw value **[free]** → **AC-7**, **AC-13**
- [ ] Unit test: a listing whose check flags every claimed skill still shows its original band unchanged, alongside the emptied matched list and both notes **[free]** → **AC-12**, **AC-13**
- [ ] Unit test: `checkFitScore()` called with no valid session returns `session_missing` before any vendor is reached **[free]** → auth, inherited from `checkUsageGate()`
- [ ] Break the `scored = checked + checkSkippedEmpty + checkUnverifiable` identity on purpose (e.g. double count one listing in two buckets) and confirm the dedicated test fails by name, then restore it **[free]** → **AC-10**

## Behavioural, paid (real vendor calls)

- [ ] `TEST_LIVE_MODEL_CALLS_ENABLED=true pnpm test:integration -t "ai_check"` **[paid, real vendor calls, at least 5]** → `checkFitScore()` against a real listing and a real claimed skill returns a parsed `ungroundedSkills` array; record each call's latency here → **AC-1**, **AC-2**, **AC-6**
- [ ] From the latencies above, apply AC-6's derivation rule (slowest observed × 3, rounded up to the nearest 5 seconds, clamped 15 to 30) and confirm `tiers.ts`'s `ai_check.timeoutMs` matches the result **[free once the paid step above has run]** → **AC-6**
- [ ] Sign in with a profile that has at least one skill → search `/search?q=engineer` → the result list appears in Adzuna's original order with every card pending, then reorders exactly once when every listing's score and check have both resolved, never card by card **[paid, up to 20 `ai_scoring` calls plus up to 20 `ai_check` calls plus one Adzuna call]** → **AC-7**, **AC-12**
- [ ] On that same render, find a card whose check flagged a skill (or construct one via a fixture profile designed to produce a borderline match) → confirm the flagged skill is absent from the displayed matched list, `COPY-9` names it, and `COPY-11` renders above the reasoning text **[paid, part of the same render above]** → **AC-7**, **AC-13**
- [ ] Read the OpenAI and Google dashboards' logs for the same period **[free, dashboard read]** → confirm real calls appear for both vendors during the render above, corroborating that the check genuinely dispatched to Google (`gemini-3.5-flash-lite`) and not silently no-opped → **AC-1** through **AC-13**, the load bearing claim that this is genuinely a different vendor

## Result, filled in when the paid steps run

_Record the measured `ai_check` latencies, the derived `timeoutMs`, and the real `/search` render's outcome distribution (how many clean, flagged, unverifiable, skipped) here once `/check verify` drives them for real._
