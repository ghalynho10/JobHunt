# Verify: eval harness runner · spec 0017 · updated 2026-09-08

_Steps derived from spec 0017 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

**Read this before running anything here.** Steps are marked **[paid]** or **[free]**. A `[paid]` step spends real vendor calls, five per pair, and the count is stated on each one. The binding ceiling is the shared `ai_scoring` global day cap of 1320, not the account weekly cap of 500: the harness mints a fresh fixture user every run, so that account counter starts at zero each time and can never be what stops it. The global counter is shared with everything else touching this tier, including a local `pnpm dev` session on `/search`.

**The harness needs a real `OPENAI_API_KEY` passed in.** `.env.test` holds a 32 character placeholder, and `test/setup/load-env.ts` uses `process.loadEnvFile`, which does not overwrite a variable already set. So a real key on the command line wins:

```
OPENAI_API_KEY=<real key> pnpm eval -t control-direct-match
```

Without it every rerun comes back `external_service_failed` in about 250ms, spends nothing, and reports every pair `inconclusive`. That reads like a scoring problem and is a configuration one; the printed `failed 5x: external_service_failed` line under the row is the tell.

## Commands

- [x] `pnpm eval -t control-direct-match` **[paid, 5 calls]** → prints a table row `PASS control-direct-match  strong_match, 5 of 5 succeeded`, writes one JSON file under `test/eval/.output/`, lists the other 15 pairs as `SKIPPED`, exits 0 → AC-1, AC-2, AC-6, AC-8, AC-9
- [x] `pnpm eval` **[paid, 80 calls]** → prints all sixteen rows, each with its own denominator, plus the preference leak line and `run completed`; exits 0 only if every pair passed → AC-1, AC-6, AC-7
- [x] Read the newest file in `test/eval/.output/` **[free]** → it carries `model`, `bandAnchorsHash`, `filter` (explicitly `null` on a full run, never an absent key), `skipped`, `incomplete`, `status`, one entry per pair with its status, denominator and band distribution, and `preferenceLeak` → AC-9
- [x] `pnpm test` **[free]** → `test/helpers/eval-verdict.test.ts` (25 tests) and `src/features/scoring/eval/band-anchors.test.ts` (2 tests) both pass, with no stack and no vendor → AC-3, AC-4, AC-5, AC-10
- [x] `grep -rn "openai\|gpt-\|gemini\|anthropic" test/eval/ test/helpers/eval-verdict.ts` **[free]** → no match; every vendor and model name reaches this feature only through `scoreListing()` and `resolvedModel(TIERS.ai_scoring.model)`. Check the exit status, do not append `|| echo` → AC-11
- [x] `pnpm test` and `pnpm test:integration` **[free]** → neither runs `test/eval/`; only `--project eval` reaches it, which `pnpm eval` wraps → spec 0017 key invariant

## Behavioural, one per Value sourcing row

- [x] **Which profile and listing are sent.** Duplicate a pair id in `src/features/scoring/eval/pairs.ts`, then run `pnpm eval -t control-direct-match` **[free, refuses before spending]** → throws `The committed ground truth set is invalid, so nothing was scored and no vendor call was made.` naming `duplicate-id`, all 16 tests skipped. Restore the file → AC-1
- [x] **The caller's identity.** During a `[paid]` run, confirm exactly one fixture user named `eval-harness-*` exists in `auth.users`, and none remains after the run → AC-2, and the cleanup invariant
- [x] **The verdict.** Covered by `test/helpers/eval-verdict.test.ts` **[free]**. Break one rule on purpose and confirm the matching test fails: the 3 of 5 floor, the strict majority (`>` not `>=`), the `stability-probe` every/some rule, and refusals excluded from the denominator → AC-3, AC-4, AC-6
- [x] **The preference leak flag.** On a full `[paid]` run the line reads `consistent, all three on strong_match` when the three agree. The three other outcomes are proved free in `eval-verdict.test.ts`: `baseline-drift`, `preference-leak-suspected`, and `leak-check-skipped` → AC-5
- [x] **The model field.** Change `TIERS.ai_scoring.model`'s model id in `src/lib/ai/tiers.ts`, run any `[paid]` step, and confirm the report's `model` follows it with no edit anywhere under `test/eval/`. Restore → AC-9, AC-11
- [x] **The anchors field.** Reword one string in `BAND_ANCHORS`, run `pnpm test` **[free]** → both assertions in `band-anchors.test.ts` fail by name, naming spec 0016's dataset. Then change only `bandAnchorsHash()`'s separator → the text assertion passes and the hash assertion fails, proving the second is not a duplicate of the first. Restore → AC-10
- [x] **The exit code.** Engage the kill switch (`update public.app_settings set kill_switch_enabled = true where id = 1`), then run `pnpm eval` **[free, the gate refuses before any vendor call]** → every pair fails naming `kill_switch_engaged`, the table prints `RUN ABORTED: kill_switch_engaged`, all sixteen are listed `INCOMPLETE` rather than `inconclusive`, exit code is non zero. Turn the kill switch back off and confirm it is off. **Gate the eval run on the flip actually succeeding**: on 2026-09-08 `psql` was absent, the flip silently failed, and the run went ahead and spent 80 unintended vendor calls → AC-3, AC-7

## Acceptance-criteria coverage

- AC-1 · covered by the two `pnpm eval` steps and the duplicate id step
- AC-2 · covered by the `pnpm eval -t control-direct-match` step and the fixture user step
- AC-3 · covered by the `pnpm test` step (verdict rules) and the kill switch step (run level abort)
- AC-4 · covered by the `pnpm test` step and the verdict break step
- AC-5 · covered by the preference leak step
- AC-6 · covered by both `pnpm eval` steps and the verdict break step
- AC-7 · covered by the full `pnpm eval` step and the kill switch step
- AC-8 · covered by the `-t control-direct-match` step (SKIPPED list) and the report read step (`filter`)
- AC-9 · covered by the report read step, the model field step and the anchors field step
- AC-10 · covered by the `pnpm test` step and the anchors field step
- AC-11 · covered by the grep step and the model field step

## Known gaps, for `/test`

- The harness file itself (`test/eval/harness.test.ts`) has no test of its own: the abort orchestration, the `skipped` and `incomplete` split, and the report assembly were each proved by hand above rather than locked by a test. They are hard to lock without a seam for injecting a rerun outcome.
- `test/eval/report.ts` has no committed test. `formatReportTable()` is pure and cheap to test; the only obstacle is that `test/eval/**` belongs to the paid project, so a test for it would need either a home under `test/helpers/` or a widened `unit` include.
