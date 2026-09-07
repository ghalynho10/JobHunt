# 0016. Eval ground truth set: rationale

## Context

Spec 0015 shipped a five band anchored rubric (`strong_match` through `not_a_match`) and, by its own admission, no evidence yet that the five bands actually spread real listings the way the design intends. Its own `AC-2` defers that question outright to "feature 16's eval harness against feature 15's ground truth set", and its Follow up records that the anchor wording is "this spec's own first attempt... expected to change." Until this ground truth set exists, nobody can tell a genuine scoring regression (a prompt edit, a model swap) from ordinary model noise, and nobody can prove or disprove that the five band scheme (itself a revision from an earlier four band draft, changed specifically because four bands risked concentrating variance at one hard boundary) actually works.

Three forces shaped this decision beyond "write some example profiles and postings":

**The rubric names no seniority ceiling.** An earlier working draft (`docs/feature-15-archetypes-and-pairs.md`) was built around a "seniority caps skills grades within it" rule that does not exist in `rubric.ts`. `BAND_ANCHORS` mentions seniority only inside `strong_match`'s own wording; the other four anchors are pure skill and work history coverage language. Spec 0015's own Key invariants state the band is decided by "skill and experience alignment only," which is not a ceiling mechanism. A ground truth set built on the missing rule would be this session's invented opinion of what should happen, not a record of what spec 0015 actually decided, exactly the thing a ground truth set exists to avoid.

**A real person's data does not belong in this set.** The same draft's first archetype was "your actual profile." That collides with this project's own fixtures rule (no real personal data in committed fixtures) and with a second fact the draft did not weigh: every archetype in this set is sent to OpenAI on every future harness run, from a public, portfolio facing repository. A real profile here is not a one time convenience; it is a standing cost paid on every run indefinitely.

**Scoring cannot run deterministically.** `ai_scoring` resolves to `gpt-5.6-luna` (`tiers.ts:119`) with `temperature` left unset (`tiers.ts:120`), because the OpenAI API rejects `temperature: 0` at any reasoning effort other than `none`. A single run of an exact expected band pair can land on an adjacent band for reasons that are not a regression. Without some notion of tolerance in the data itself, feature 16's harness has no way to distinguish a pair that is supposed to be exact from one that genuinely admits more than one honest answer.

## Options considered

### Option 1: Reuse the earlier draft's three archetypes largely as is

Keep the three archetype design (a direct match control, a severe seniority gap test, a same seniority wrong domain test) and resolve its two flagged open questions by picking one answer for each, closing them as settled.

**Pros**:
- Least new authoring work; most of the pair table is already drafted.
- Preserves the seniority focused narrative the draft was built around.

**Cons**:
- Forces this spec to invent a rubric rule (how severely a seniority or experience gap caps the band) that spec 0015 never wrote, and then present that invention as ground truth rather than as a decision this spec quietly made.
- Keeps a real profile as archetype 1, which is both a fixtures rule violation and a standing cost paid on every future harness run in a public repository.
- Leaves a real, acknowledged gap in the draft: no pair cleanly produces `weak_match` at all, since every candidate for that band is one of the two flagged unresolved anchors.

### Option 2 (chosen): Four fully fictional archetypes, every band traced to the rubric's own written text, tolerance where the text cannot decide alone

Expand to four archetypes, all fictional, drop the seniority cap framing entirely, and derive every pair's expected band from what `BAND_ANCHORS` actually says. Where the anchor text alone cannot narrow to one confident answer (the severe seniority shortfall case), the pair carries a widened `acceptableBands` range and an explicit note naming the gap, rather than a single invented answer.

**Pros**:
- Every expected band traces to a decision spec 0015 actually made, not one this spec invents and disguises as fact.
- Closes the real personal data and public repository exposure gap outright.
- The tolerance mechanism (`acceptableBands`) gives feature 16 something concrete to build its pass or fail logic against, for both the genuine rubric ambiguity and the model's own non deterministic temperature.
- A dedicated fourth archetype gives `weak_match` a clean, unambiguous example instead of leaning on the same case that is already carrying the seniority ambiguity.

**Cons**:
- More archetypes and pairs to author than the original three (four archetypes, fifteen pairs instead of ten).
- Does not resolve the anchor ambiguity itself, only surfaces it honestly; the "does a severe experience gap cap the band" question stays genuinely open until spec 0015 is revisited.

### Option 3: Defer this spec until spec 0015's anchors are amended first

Treat the anchor ambiguity as a blocking prerequisite: run a separate `/architect` pass to revise `BAND_ANCHORS` so it states explicitly how a severe experience or seniority gap weighs against a genuinely overlapping skill, then build the ground truth set against the clarified anchors.

**Pros**:
- Every pair, including today's boundary case, would get a single confident expected band with no tolerance mechanism needed at all.

**Cons**:
- Blocks a scoped, buildable feature (feature 15) on a second, unscoped design decision nobody has asked for yet.
- `docs/scope/scope.md`'s own Done when bar for this feature does not require resolving the anchor ambiguity, only building a set that spans the band range including deliberate poor fits, which Option 2 already satisfies without the extra dependency.
- Amending a rubric that has been live and scored against for real listings since 2026-09-06, on the strength of a ground truth set that does not exist yet to justify the amendment, inverts the order spec 0015's own Follow up recommends: revise anchors from evidence, which this set is what produces the evidence.

## Rationale

Option 2 is the only one of the three that keeps this spec honest about what it is: a record of what spec 0015 actually decided, not a second, undisclosed design pass dressed up as ground truth data. Option 1's seniority cap framing does not exist in the rubric the model is actually given, so a pair built on it would fail for a reason that has nothing to do with the scorer, exactly the false signal a ground truth set exists to prevent. Option 1's use of a real profile also does not survive contact with how this set is actually used: sent to a vendor on every run, from a repository anyone can read, indefinitely, not once.

Option 3's instinct, that resolving the ambiguity first would make every pair cleaner, is correct but backwards for this project's own stated order of operations. Spec 0015's Follow up already names revising the anchors as the response to evidence the harness turns up, not a prerequisite for building the harness's own ground truth. Blocking feature 15 on an unscoped spec 0015 amendment would also leave feature 16 with nothing to test against indefinitely, for a gap Option 2's tolerance mechanism already handles honestly without inventing an answer.

The fourth archetype (`adjacent-insufficient-depth`) is a direct response to a concrete problem, not padding: the earlier draft's own author noted that every candidate for `weak_match` was one of the two flagged, unresolved anchors, meaning the set had no clean proof the model could produce a genuine `weak_match` at all. A dedicated archetype whose overlap is real but small by construction (shared general software literacy, no backend depth) closes that gap without leaning on an already ambiguous case to do double duty.
