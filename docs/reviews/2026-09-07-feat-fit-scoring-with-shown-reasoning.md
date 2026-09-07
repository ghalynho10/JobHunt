# Review, feat/fit scoring with shown reasoning, 2026 09 07

**Reviewed by**: Claude Sonnet 5 (author model not stated in the task)
**Scope**: 37 files (plus pnpm lock), branch vs main (merge base 1851097fbd665a295bee26e6811c76d5f0c7b0ba)
**Verdict**: Approve with nits

## Summary

This change ships spec 0015 end to end: scoring every search result against the caller's own profile through the spec 0012 router, showing the band, the matched and not mentioned skills, and the written reasoning, plus a keyboard focus restoration mechanism for the one time re sort. The implementation is careful and the acceptance criteria are traceable line by line into the code. The two concurrency and ranking guarantees (AC 8, AC 9), the refusal versus failure split (AC 10, AC 11), and the focus restore rules (AC 17) are all implemented as specced, with doc comments that cite the acceptance criterion and explain why, not just what. Test coverage is unusually strong for the parts that can be reached in a node or jsdom environment, including a real jsdom test that pins the capture phase contract behind the focus fix. The one real gap is that `scoreListing()`, the function that actually ties the vendor call to the post parse skill filter, has no unit test with a mocked `callTier`, so its two failure branches and its one success branch are exercised only by an opt in, real vendor integration test that is off by default.

## Major

### 🟠 `scoreListing()` has no unit test with a mocked vendor call, `src/features/scoring/score.ts:59`

**Problem**: `scoreListing()` is the function that calls `callTier("ai_scoring", …)`, passes through a failure or a refusal unchanged, and otherwise applies `normalizeFitScore()` to the vendor's answer. None of that is under a unit test. `score-listings.test.ts` mocks the whole `./score` module away, so it never runs this code. `test/integration/fit-scoring-live.test.ts` does call the real function, but it is gated behind `TEST_LIVE_MODEL_CALLS_ENABLED`, unset by default, so neither `pnpm test` nor a plain `pnpm test:integration` run touches this file at all. Even when that flag is set, the live test only exercises the allowed, successful path; the failure passthrough and the refusal passthrough branches inside `scoreListing()` are never exercised by any test in the repository.
**Why it matters**: This is exactly the seam AC 5 depends on: a change that dropped the `normalizeFitScore()` call, applied it to the wrong branch, or broke the failure and refusal passthrough would compile, typecheck, and pass every other test in this diff, since `score-listings.test.ts` never sees the real function and the live test is opt in. A regression here would only surface as a hallucinated skill name reaching a real reader's screen, which is the one outcome this feature's central guarantee exists to prevent.
**Suggested fix**: Add `src/features/scoring/score.test.ts`, mocking `@/lib/ai/client`'s `callTier` the same way `score-listings.test.ts` mocks `./score`. Cover three cases: a successful, allowed result gets `normalizeFitScore()` applied against `profile.skills`; a `Failure` passes through untouched; an `{ allowed: false, reason }` refusal passes through untouched. This needs no vendor and no database, matching the pattern the rest of this feature already uses.

## Minor

### 🟡 `Button`'s new `focusKey` prop has no test proving it renders, `src/components/ui/button.tsx:166`

**Problem**: The `focusKey` prop was added to `Button` and threaded onto `data-focus-key` on all three render branches (the plain button, the external anchor, and the internal `next/link`). `button.test.ts` was not touched in this diff. Nothing in the unit suite asserts that `Button({ focusKey: "x", … })` actually produces a `data-focus-key` attribute on any of the three shapes; `result-card.test.ts` only proves that `ResultCard` passes the right string down as a prop, and `focus-keeper.dom.test.tsx` builds its own synthetic anchors by hand rather than rendering the real `Button`.
**Why it matters**: This is the actual wiring AC 17's whole mechanism depends on: `FocusRecorder` and `FocusRestorer` both query `document.querySelectorAll('[data-focus-key]')`. A typo in the attribute name on one of the three branches, or a forgotten one on the branch a future caller happens to use, would compile and look correct in review, and the only symptom would be the exact silent focus loss this feature exists to fix. `button.test.ts` already calls `Button()` directly and reads `el.props`, so this would be a small, cheap addition and it sits right next to the existing tests for the button's element shape.
**Suggested fix**: Add three assertions to `button.test.ts`, one per branch (plain button, external link, internal link), checking `(el.props as { "data-focus-key"?: string })["data-focus-key"]` equals the `focusKey` passed in.

## Nits

- ⚪ `AGENTS.md:37` and `src/components/ui/AGENTS.md:41` both still say the unit project has no jsdom, which is now false (`focus-keeper.dom.test.tsx` opts into it). This is already recorded honestly in `docs/session-notes.md` as an open item owned by `/sync` at merge, so no action is needed from this review beyond noting it is not forgotten.
- ⚪ `src/features/scoring/rubric.ts:152` and `:275` define `MAX_SKILLS_PER_LIST` and `MAX_PROMPT_SKILLS`, two separately named constants that both happen to equal 50 for different reasons (the output filter cap and the input bound). The doc comments explain why they are separate, so this is not a defect, just worth knowing if either ever needs to diverge from 50 on its own.

## Strengths

- The test suite for the focus restoration mechanism (`focus-keeper.test.ts`, `focus-keeper.dom.test.tsx`, `focus-key.test.ts`) is excellent: it names the exact shipped defect (a bubble phase listener silently missing every focus event inside an unresolved Suspense boundary), pins the capture phase flag as a regression guard, and tests the counterweight to every rule (never stealing focus from a live element, forgetting the key on every mount whether it restored or declined) rather than only the happy path.
- `docs/observability/spans.md` and `docs/scope/scope.md` were both updated in the same change as the code, and the span's own registration explains why its failure ratio has to be read from its attributes rather than its status, which is a real operational subtlety stated plainly rather than left for someone to discover later.
- The refusal versus failure split (AC 10, AC 11) is enforced consistently across `score-card.tsx`, `page.tsx`, and their tests, with explicit tests proving the two states render visibly differently rather than only that each renders something.

## Test coverage

Strong across the board except for the one gap above. `rubric.ts` (the prompt builder, the schema, the post parse filter, the profile bounding) is fully covered by pure unit tests with real expected value ranges, not just schema shape. `score-listings.ts` is covered for concurrency, ordering, and the span's three way tally. `profile-gate.ts` is covered for all three outcomes including the "either section is enough" counterweight. `score-card.tsx` is covered for all four card states and for telling them apart from each other, which is the more dangerous defect than any one state simply failing to render. `page.tsx` carries an unusually thorough test file covering all of the visible states, the ranking, the cap and failure notices, and the placement of the two focus components relative to the Suspense boundary. The one gap is `score.ts` itself, detailed above.
