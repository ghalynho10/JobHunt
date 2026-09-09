# 0018. Band anchor review

**Date**: 2026-09-08
**Status**: In Progress

## Summary

Feature 16's eval harness produced two pairs whose recorded answer disagreed with the model, and spec 0015 said the band anchors (the text in `rubric.ts` telling the model what each of the five fit bands means) were the first thing to revise if that happened. This spec is that review, and its finding is that the anchors do not need to change. One of the two disagreements is a mistake in the committed expectation, which the existing anchor text already settles, and it is corrected here. The other turned out to rest on a misread number and is ordinary variation, not a defined gap. Nothing about live scoring changes.

## Requirements

**User stories**:

- As the person maintaining the rubric, I want the one disagreement the anchors can already settle to be settled, so a committed expectation stops asserting an answer its own anchor text contradicts.
- As the person maintaining the rubric, I want a rule that was drafted and rejected to be written down with its reasons, so the next person to look at this does not spend the same effort reaching the same dead end.
- As someone reading a fit score, I want the rubric left alone unless there is evidence to change it, because every anchor edit moves real scores with nothing recording what they were before.

**Acceptance criteria**:

- **AC-1**: `control-one-gap`'s `expectedBand` in `src/features/scoring/eval/pairs.ts` is `possible_match`, with no `acceptableBands`, and its `rationale` argues that from the existing `possible_match` anchor text rather than from any new rule. The rationale also states plainly that this band was re-argued on 2026-09-08 after two runs disagreed, and names the ground that makes it independent of those runs: the posting's own sentence calling the infrastructure half what sets the role apart, written before any model was asked.
- **AC-1b**: `pairs.ts`'s header no longer claims without exception that every `expectedBand` was argued before any model was asked, because after AC-1 that is untrue of one pair. It names the exception and why the exception is not the accommodation the header warns about. This matters more than a comment usually would: the sentence immediately after that claim is the file's whole justification, that a band read off a model's output would make the set a description of today's scorer rather than a measurement of it.
- **AC-2**: `BAND_ANCHORS` in `src/features/scoring/rubric.ts` is unchanged, so `band-anchors.test.ts`'s pinned text and committed hash `1b45f524b356` are untouched and still pass, and reports written before and after this change remain comparable.
- **AC-3**: `validateGroundTruth(ARCHETYPES, PAIRS)` reports no issue on the updated set, and `ground-truth.test.ts`'s stricter check that every band is some pair's exact `expectedBand` still passes, which it does because `good-match-adjacent` keeps `good_match`.
- **AC-4**: The misread run evidence is corrected everywhere it appears. Searched and found at `docs/scope/scope.md:326`, added in commit `b51cb83` (`docs(scope): record the eval harness verification and its first finding`), which also layers the inference "a stable disagreement rather than noise" on top of the misread and closes by handing the question to `/architect`. The correction states the per pair distributions rather than a summary line, removes the "stable disagreement" inference, and points at this spec. `docs/experiments/0016-eval-ground-truth-set.md` is a recorded transcript and stays as it is.
- **AC-4b**: Spec 0016's two now stale references to `control-one-gap` are corrected: its table row at line 141 lists the pair as `good_match`, and its Follow up at line 182 quotes that pair's rationale saying "That is good_match's wording" as present tense evidence of how the set was authored. The row is updated and the Follow up quote is marked as historical, true of the set as authored and superseded here. Both are recording edits, not changes to what spec 0016 decides.
- **AC-5**: `pnpm eval -t control-one-gap` passes, confirming the corrected expectation against the real scorer for five vendor calls rather than eighty.

## Decision

**Chosen option**: Option 2: Correct the pair, leave the anchors alone, and record the rejected rule.

`control-one-gap`'s recorded expectation is wrong under the anchor text that already exists, so the pair is corrected and `BAND_ANCHORS` is not touched.

## Review findings

**What the harness actually showed.** Read from the two full runs on 2026-09-08 against `gpt-5.6-luna`, per pair rather than from the printed summary line:

| Pair | 07:30 distribution | 07:35 distribution | Recorded expectation |
|---|---|---|---|
| `control-one-gap` | `good_match` 1, `possible_match` 4 | `possible_match` 5 | `good_match` |
| `key-domain-mismatch` | `weak_match` 3, `not_a_match` 2 | `not_a_match` 5 | `not_a_match` |

A caution that belongs in the record, because it caused a wrong conclusion once already. The report's `summary` field reads like `"possible_match, 5 of 5 succeeded"`, and the `5 of 5` there is the **success denominator**, meaning all five reruns returned a band rather than failing. It is not the count landing on that band. Reading it as the band count is what produced the claim that both pairs were stable at 5 of 5, which the distributions above disprove. Read `distribution`, never `summary`, when the question is how the reruns split.

**Finding 1, `control-one-gap` is a wrong expectation, and the anchors already settle it.** The posting covers Python, PostgreSQL and data pipelines, all of which the archetype has, and then says two things in its own words: "What sets this role apart is the infrastructure half", and "Real production Kubernetes ownership is required, not just exposure to it". The archetype has read manifests and never owned a cluster. The pair's author read Kubernetes as one of the "one or two areas unproven or a stretch" that `good_match` allows. That reading treats an area the posting itself calls the half that defines the role as peripheral. `possible_match`'s existing text is a better fit with no new rule needed: "The candidate covers a real part of what the visible posting asks for, and a real part is unproven. Applying would mean arguing that the experience transfers rather than pointing at it." The model returned `possible_match` as its verdict on both runs. The correction is to the pair, not to the anchors.

**Finding 2, the `weak_match` and `not_a_match` line is still undefined, and there is still no good evidence about it.** `key-domain-mismatch` split 3 to 2 and then landed 5 to 0. That is ordinary variation on a boundary, not the signature of a rule the model cannot apply. The anchors genuinely say nothing about where this line falls, which spec 0016 recorded when it gave `boundary-seniority-gap` a widened tolerance, and that remains true and remains unfixed. It is left alone here because a rule written now would be written from one noisy pair, and a rule that lowers real users' bands deserves better evidence than that.

**What is unchanged and why it matters**: `BAND_ANCHORS`, the anchor hash `1b45f524b356`, the drift guard, `scoreListing()`, the response schema, the five `Band` values, and every other pair's expectation. No table stores a band or a fit score, verified by searching every file in `supabase/migrations/` for `band` and `fit_score` and finding no match, so there is nothing to migrate and no stored score to become inconsistent.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| The harness judges `control-one-gap` | the expected band | `expectedBand` in `pairs.ts`, corrected to `possible_match` by AC-1, argued from the existing anchor text. |
| A run's report | `bandAnchorsHash` | `bandAnchorsHash(BAND_ANCHORS)`, unchanged at `1b45f524b356` because the anchors are untouched, which is what keeps this change's runs comparable with the two baseline runs. |
| The AC-4 correction | what the runs actually showed | The `distribution` field of each pair in the two reports, copied into `verify.md` because those reports live in `test/eval/.output/`, which is gitignored and will not survive a clean checkout. |
| AC-3's band coverage | which pair holds `good_match` exactly | `good-match-adjacent`'s `expectedBand`, which is why moving `control-one-gap` off `good_match` does not break coverage. |

**Key invariants**:

- A pair's recorded expectation must be defensible from the anchor text as written. Where the two disagree, one of them is wrong and the disagreement is resolved rather than absorbed by widening the pair.
- `acceptableBands` widens a genuine ambiguity in the anchors. It is not a way to stop a pair failing, which is why `control-one-gap` is corrected outright rather than given a tolerance.
- The anchors change only on evidence that the anchors are what is wrong. A pair disagreeing with the model is evidence that one of them is wrong, not automatically the anchors.

**Critical test scenarios**:

- The corrected pair scores `possible_match` against the real scorer, verifies **AC-1**, **AC-5**.
- The free suite still passes with the anchors untouched, including both drift assertions, verifies **AC-2**.
- The updated set passes its data quality gate with every band still holding an exact expectation, verifies **AC-3**.

## Build plan

Ordered so that everything provable for free is proved before anything is paid for, which is this project's Tracer Bullet approach applied to a change whose only expensive step is a vendor call.

1. Correct `control-one-gap` in `src/features/scoring/eval/pairs.ts`: `expectedBand` to `possible_match`, no `acceptableBands`, and rewrite its `rationale` to argue from the existing `possible_match` anchor text and from the posting's own "what sets this role apart" wording, stating that it was re-argued on 2026-09-08 and on what independent ground. Then amend the file header so its "before any model was asked" claim names this one exception. Satisfies **AC-1**, **AC-1b**.
2. Correct the misread evidence at `docs/scope/scope.md:326`, stating the per pair distributions rather than the summary line and dropping the "stable disagreement" inference. Then correct spec 0016's table row at line 141 and mark its Follow up quote at line 182 as historical. Satisfies **AC-4**, **AC-4b**.
3. Run the free suite: the drift guard still passes untouched, `validateGroundTruth` reports no issue, and every band still has an exact expectation. Satisfies **AC-2**, **AC-3**.
4. Run `pnpm eval -t control-one-gap`, five vendor calls, and confirm the pair now passes. Satisfies **AC-5**.

## Consequences

**Positive**:

- Live scoring does not change. No user sees a different band, and the anchor hash stays put, so the two baseline runs remain comparable with every run after this.
- A committed expectation that contradicted its own anchor text is fixed, and `control-one-gap` becomes a pair that passes for the right reason rather than one that fails for a recorded mistake.
- The anchors were examined against two real runs for the first time and held, which is worth recording even though it changes nothing. Note carefully that this does **not** close spec 0015's Follow up on revising the anchors: that item is conditional on the harness showing the bands clustering rather than spreading, and both runs observed all five bands, so its trigger never fired. It stays open, and this spec should be noted beside it as a review that happened for a different reason.
- Confirming the fix costs five vendor calls instead of eighty, because only one pair's expectation moved.

**Negative / tradeoffs**:

- The `weak_match` and `not_a_match` line stays undefined. `key-domain-mismatch` can still flip between runs, and `boundary-seniority-gap` keeps a tolerance that means it cannot fail. Two of sixteen pairs remain unable to catch a regression on that axis.
- The question of what a stated requirement does to a band is left unanswered **as a general rule**. This pair is settled by `possible_match`'s existing "a real part is unproven" applied to a posting that names the unproven area as half the role, which is the anchors doing the work. What stays undefined is the rule for any posting that does not name the weight that plainly, so the next one phrased "required, not just exposure" gets whatever the model decides.
- This spec produces no improvement to the product. It corrects a measurement instrument and records a rejected idea, which is worth doing and is not the same as making scoring better.

**Neutral**:

- No migration, no feature flag, no environment variable, no schema change, and nothing to backfill.
- The rejected rule is recorded rather than discarded. If a real posting later produces the failure it was meant to prevent, the reasoning is there to pick up rather than rederive.

## Follow-up

- [ ] The `weak_match` and `not_a_match` boundary is still undefined and is still recorded as a gap in spec [0016](../0016-eval-ground-truth-set/index.md)'s Follow up. **Three pairs sit on it, not two**, across thirty reruns: `key-domain-mismatch` (3 to 2, then 0 to 5), `weak-match-shallow-overlap` (4 to 1, then 3 to 2) and `boundary-seniority-gap` (`weak_match` 4 of 5 both runs, passing only through its widened tolerance). The one to watch is `weak-match-shallow-overlap`: it carries no tolerance and at 3 to 2 is a single rerun away from having no majority at all, so it is the pair most likely to fail next and the failure would be the boundary, not the pair. What would justify acting is repeated flipping, not one split.
- [ ] No production telemetry records the band distribution on real traffic, so the harness's sixteen invented pairs are the only view of whether the bands discriminate. Deliberately not solved here: putting a returned band on a span is a judgement about a named person against a named employer, which touches the privacy notices and the recorder's value redaction, and deserves its own decision.
- [ ] The report's `summary` field is easy to misread as a band count when it is a success denominator, and it caused a wrong conclusion in this spec's own first draft. Worth considering whether `formatReportTable` and the JSON should make the distribution the prominent value, since the distribution is what anyone reasoning about a disagreement actually needs.
- [ ] **Two bands now rest on a single pair each, not one.** Counting the committed set after this spec's correction: `strong_match` 7, `possible_match` 4, `not_a_match` 3, `good_match` 1, `weak_match` 1, sixteen pairs. `good-match-adjacent` holds the only exact `good_match` expectation, and `good_match` was already the thinnest observed band at 4 and 5 occurrences of 80. `weak-match-shallow-overlap` holds the only exact `weak_match` expectation, which is not a new consequence of this spec but a property the set already had, and that pair's own rationale in `pairs.ts` says so in terms: it is "the set's only exact weak_match pair, so widening it would leave that band reachable only through boundary-seniority-gap's own tolerance". For either band, if its one pair moves, the band loses its exact expectation and `ground-truth.test.ts` names it, which is the guard working, but the set would want a second pair for that band before then. **`weak_match` is the more exposed of the two**, and the ground is this spec's own first Follow up item above: it puts `weak-match-shallow-overlap` on the still undefined `weak_match` and `not_a_match` boundary, records it moving 4 to 1 and then 3 to 2 across thirty reruns, and calls it the pair most likely to fail next. So the band with the thinner margin of safety is the one whose only holder this spec already predicts will move, while nothing similar is recorded against `good-match-adjacent`, which sat at `good_match` 4 of 5 in both runs.

## Rationale

See [rationale.md](rationale.md) for the problem context, the options weighed, and the rule that was drafted and rejected.
