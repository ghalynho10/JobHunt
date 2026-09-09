# 0018. Band anchor review, verify checklist

Run by `/check verify` after `/develop`. Every step says what it costs. Check the exit status of any command whose result is being reported, and never append `|| echo` to a check, because `||` fires on a bad path exactly as it fires on a clean result.

## The evidence, recorded here because its source is gitignored

These are the per pair distributions from the two full runs on 2026-09-08 against `gpt-5.6-luna`, anchor hash `1b45f524b356`. The reports live in `test/eval/.output/`, which is gitignored, so a clean checkout or one housekeeping pass loses them and nobody could check this spec's reasoning afterwards.

| Pair | 07:30 | 07:35 | Recorded expectation |
|---|---|---|---|
| `control-one-gap` | `good_match` 1, `possible_match` 4 | `possible_match` 5 | `good_match`, corrected by this spec |
| `key-domain-mismatch` | `weak_match` 3, `not_a_match` 2 | `not_a_match` 5 | `not_a_match`, unchanged |
| `boundary-seniority-gap` | `possible_match` 1, `weak_match` 4 | `possible_match` 1, `weak_match` 4 | `not_a_match` accepting `weak_match`, unchanged |
| `good-match-adjacent` | `good_match` 4, `possible_match` 1 | `good_match` 4, `possible_match` 1 | `good_match`, unchanged |
| `weak-match-shallow-overlap` | `weak_match` 4, `not_a_match` 1 | `weak_match` 3, `not_a_match` 2 | `weak_match`, unchanged |
| `stability-probe-generic` | `possible_match` 5 | `possible_match` 5 | probe, unchanged |
| `possible-adjacent-domain` | `possible_match` 5 | `possible_match` 4, `weak_match` 1 | `possible_match`, unchanged |

`possible-adjacent-domain` is in this table for a specific reason: it is the only pair that moved between the two runs without being part of the disagreement, and its single `weak_match` in the 07:35 run is otherwise an unexplained entry in that run's totals. Without it, the "a pair that moved without being touched" line at the bottom of this checklist has no baseline to compare against.

Run wide band totals across all 80 reruns: 07:30 was `strong_match` 35, `good_match` 5, `possible_match` 21, `weak_match` 11, `not_a_match` 8; 07:35 was 35, 4, 21, 8, 12. Both runs observed all five bands, so spec 0015's AC-2 bar of at least three of five was already met and this spec does not move it.

**Do not read the `summary` field to answer how the reruns split.** It reads like `"possible_match, 5 of 5 succeeded"`, where `5 of 5` is the success denominator, meaning no rerun errored. It is not the count that landed on that band. Reading it as a band count is what produced this spec's first draft and a wrong conclusion. Read `distribution`.

## Commands

- [x] `pnpm test` **[free]** → green. In particular `band-anchors.test.ts`'s two assertions still pass **untouched**, because this spec changes no anchor → AC-2
- [x] `pnpm lint`, `pnpm format:check`, `pnpm typecheck` **[free]** → all clean
- [x] `git diff --stat main -- src/features/scoring/rubric.ts` **[free]** → no output. The anchors are unchanged, which is this spec's central claim and the one thing a reader will most want to confirm quickly → AC-2
- [x] Read `control-one-gap` in `src/features/scoring/eval/pairs.ts` **[free]** → `expectedBand` is `possible_match`, there is no `acceptableBands` key, and the `rationale` argues from the existing `possible_match` anchor wording and the posting's own "what sets this role apart" sentence, naming no rule that does not exist → AC-1

## Behavioural

- [x] **The data quality gate passes and every band still has an exact expectation.** Run the free suite **[free]** → `validateGroundTruth` reports no issue, and `ground-truth.test.ts`'s "covers every band with at least one exact expectation" passes. `control-one-gap` moving off `good_match` leaves `good-match-adjacent` as the only pair expecting it exactly, so break that on purpose (point `good-match-adjacent` at another band) and confirm the test fails by name before restoring → AC-3
- [x] **The anchor hash did not move.** Read the newest report in `test/eval/.output/` after the run below **[free]** → `bandAnchorsHash` is still `1b45f524b356`, the same value the two baseline runs carry, which is what makes this change's run comparable with them → AC-2
- [x] **The header's claim now admits its exception.** Read the top of `src/features/scoring/eval/pairs.ts` **[free]** → the "EVERY `expectedBand` BELOW WAS ARGUED ... BEFORE ANY MODEL WAS ASKED" claim names `control-one-gap` as the one exception and says why it is not the accommodation the next sentence warns about. This is the check that matters most in this file: that sentence is the set's whole justification, so leaving it absolute after correcting a pair would make the file assert something it no longer does → AC-1b
- [x] **The misread evidence is corrected.** Read `docs/scope/scope.md:326` **[free]** → it states the per pair distributions above rather than a summary line, no longer claims either pair was stable at 5 of 5, and no longer carries the "stable disagreement rather than noise" inference built on top of it. Then search the repository again for the old claim and say how many places were checked and how many were found, per the 2026-08-31 reflex about correcting every instance in one pass. At the time of writing the only repeat was `scope.md:326`; `docs/experiments/0016-eval-ground-truth-set.md` is a recorded transcript and is left alone on purpose → AC-4
- [x] **Spec 0016 no longer describes the old expectation as current.** Read `docs/specs/0016-eval-ground-truth-set/index.md` lines 141 and 182 **[free]** → the table row gives `control-one-gap` as `possible_match`, and the Follow up's quote of that pair's rationale saying "That is good_match's wording" is marked as historical rather than reading as a present tense fact about the set → AC-4b
- [x] **`pnpm eval -t control-one-gap`** **[paid, 5 calls]** → the pair passes, returning a `possible_match` verdict against its corrected expectation. Record the distribution here rather than the summary line. Five calls, not eighty, because one pair's expectation moved and no anchor did → AC-5

## The result, filled in when the paid run happens

`control-one-gap` distribution on the confirming run: **`good_match` 2, `possible_match` 3**, read from the report's `distribution` field. Run at 2026-09-09T03:44:20Z against `gpt-5.6-luna`, anchor hash `1b45f524b356`, filter `control-one-gap`, 15 pairs skipped, status `completed`, exit 0. The pair **passes**, since `possible_match` is the strict majority and clears spec 0017's floor of 3 of 5.

Read the split, not the verdict. The report's `summary` for this same pair reads `"possible_match, 5 of 5 succeeded"`, which is the success denominator again, and the actual margin is the minimum the harness accepts. Two of five reruns still returned `good_match`, so the corrected expectation is confirmed but not by a wide result, and one rerun moving the other way would leave no majority at all. That is the same fragility spec 0016's Follow up records for `weak-match-shallow-overlap`, now observed on this pair too. It is not a reason to widen `control-one-gap` with `acceptableBands`, per this spec's own invariant, and it is not evidence against the correction either: the old `good_match` expectation lost 3 to 2 here and 4 to 1 and 5 to 0 on the two baseline runs, so it has now failed on all three runs ever taken.

Anything unexpected, including a pair that moved without being touched:

- **The UTC day rolled between the design of this checklist and the confirming run**, so the usage counter proof had to watch a different row than expected. `check_usage_gate` computes `period_start` in UTC (`supabase/migrations/20260902120000_usage_gating.sql`), the run happened at 03:44Z on 2026-09-09 while the local date was still 2026-09-08, and the `2026-09-08` day row therefore stayed at 195 throughout. Watching that row would have shown no movement and read as though the filter had selected nothing. What actually moved: a new `ai_scoring global day 2026-09-09` row appeared at exactly 5, and `ai_scoring global month 2026-09-01` went 1225 to 1230. Five calls, one pair, confirmed by measurement rather than by reading the filter output.
- **No pair moved without being touched**, because no other pair ran. The filter skipped the other 15, so this run says nothing about the `possible-adjacent-domain` style drift the table above records, and the preference leak check reports `skipped, preference-match did not run` rather than passing.
- The anchor hash on this run is `1b45f524b356`, the same value both baseline runs carry, which is what makes this run comparable with them (AC-2).
