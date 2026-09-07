# Verify: eval ground truth set · spec 0016 · updated 2026-09-07

_Steps derived from spec 0016 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Nothing here runs on a request path, so there is no UI to drive. Every step is a
command or a call against the committed data. The last three drive the real
consumer, `buildScoringPrompt()`, rather than re-reading the data, because that
is where a wrong value would actually show up.

## Commands

- [x] `pnpm test src/features/scoring/eval` → 21 tests pass: the validator's own per check cases against deliberately malformed fixtures, plus the committed set's assertions → AC-8
- [x] Delete the `stability-probe-not-truncated` push in `validateGroundTruth()`, run `pnpm test src/features/scoring/eval` → 2 tests fail by name; restore → AC-8
- [x] Change any pair's `expectedBand` to `"great_match"`, run `pnpm typecheck` → compile error against `Band`; restore → AC-6, AC-7
- [x] Change any archetype's `profile.skills` to a string rather than an array, run `pnpm typecheck` → compile error against `ScoringProfile`; restore → AC-6, AC-7
- [x] Print every `PAIRS[].listing.descriptionSnippet.length` → all 15 are at or under 500, and `stability-probe-generic` sits at 495, near the ceiling rather than short → AC-5, AC-6
- [x] Print `new Set(PAIRS.map((p) => p.expectedBand))` → all five of `strong_match`, `good_match`, `possible_match`, `weak_match`, `not_a_match` appear as an exact expectation, not only inside some pair's `acceptableBands` → AC-2
- [x] Print every pair carrying `acceptableBands` → only `boundary-seniority-gap` and `stability-probe-generic`, each holding at least two bands including its own `expectedBand` → AC-3
- [x] Print `ARCHETYPES.length` and each `id` → at least four, each a plainly different career shape per its own `description` field → AC-1
- [x] `grep -riE "ghaly|jobhunt|adzuna|supabase" src/features/scoring/eval/archetypes.ts` → no hits. Read the four archetypes and confirm every employer named is invented → AC-1
- [x] Confirm `ARCHETYPES` and `PAIRS` live in `.ts` modules under `src/features/scoring/eval/`, not inside any `.test.ts` file → AC-7

## Value sourcing

One step per row of the spec's Value sourcing table, exercising the source
rather than the value.

- [x] `PAIRS.every((p) => ARCHETYPES.some((a) => a.id === p.archetypeId))` → true, so every pair resolves to a real profile with no database read → row 1 (which profile is sent)
- [x] For `boundary-seniority-gap`, confirm a run answering `weak_match` passes and one answering `good_match` fails, reading `expectedBand` widened by `acceptableBands` and nothing else → row 2 (the pass or fail expectation)
- [x] Read `direct-fit-control.profile.preferences` and `preference-violation`'s posting side by side → `Chicago, IL` is absent from `desired_locations`, "on site in our Chicago office five days a week" contradicts `remote_preference: "remote"`, and `$95,000` is below `minimum_pay: 120000`. All three conflicts are in `descriptionSnippet` and `location`, none in `salaryMin`/`salaryMax` → row 3 (which facts must conflict)
- [x] Break one invariant in the committed data (duplicate a pair id), run `pnpm test src/features/scoring/eval` → the committed set test fails naming that id; restore → row 4 (which invariants must hold)

## Behavioural, through the real consumer

- [x] Call `buildScoringPrompt(directFitControl.profile, stabilityProbeGeneric.listing)` → output contains `CUT OFF: this is the first 500 characters of a longer description`, so the probe really reaches the truncated branch rather than being described to the model as a whole posting → AC-5
- [x] Replace `stability-probe-generic`'s trailing `…` with `...` and call `buildScoringPrompt()` again → output now says `Description (short enough that Adzuna returned all of it)`, the exact failure the `stability-probe-not-truncated` check exists to stop; restore → AC-5
- [x] Diff `buildScoringPrompt()` output for `preference-match` against `preference-violation` → they differ only in the `Location:` line and the posting's final two sentences. Every skill and experience requirement line is byte identical, so a band that moves between them can only have come from a preference → AC-4
- [x] In the same two outputs, confirm both carry the archetype's `Desired locations`, `Remote preference` and `Minimum pay` lines under the "context for your reasoning only, never for the band" heading → AC-4
- [x] Read the `rationale` on each of the 15 pairs → each argues its band from `BAND_ANCHORS`'s own wording, and the two widened pairs say plainly what the anchors cannot settle rather than asserting an answer → AC-2, AC-3

## Acceptance-criteria coverage

- AC-1 · covered by the archetype count, the career shape read, and the real name grep
- AC-2 · covered by the exact band coverage print and the rationale read
- AC-3 · covered by the `acceptableBands` print and `boundary-seniority-gap`'s pass or fail step
- AC-4 · covered by the two `buildScoringPrompt()` diff steps and the preferences conflict read
- AC-5 · covered by the snippet length print and the two truncation branch steps
- AC-6 · covered by the two typecheck break steps and the snippet length print
- AC-7 · covered by the two typecheck break steps and the module location check
- AC-8 · covered by the suite run, the removed check step, and the broken data step
