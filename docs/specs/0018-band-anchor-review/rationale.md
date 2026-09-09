# 0018. Band anchor review, rationale

The decision record behind [index.md](index.md). `/develop` does not need this file.

## Context

Spec 0015 wrote the five band anchors as its own first attempt and said so: its Consequences record that feature 16's harness, not that spec's reasoning, is the mechanism that would show whether the anchors discriminate real listings, and its Follow up names the anchors as the first thing to revise if the harness found trouble. The harness has now run twice against all sixteen pairs and two pairs disagreed with their recorded answers, so this review is that Follow up being acted on.

The two disagreements are not the same kind of thing. `control-one-gap` puts an archetype that covers Python, PostgreSQL and data pipelines against a posting that asks for all three and then says, in its own words, "What sets this role apart is the infrastructure half" and "Real production Kubernetes ownership is required, not just exposure to it". The archetype has read manifests and never owned a cluster. The pair's author recorded `good_match`; the model returned a `possible_match` verdict on both runs. `key-domain-mismatch` puts a data analyst against a backend and AI engineering posting and sits on the line between `weak_match` and `not_a_match`, which the anchors describe only by degree and never locate.

There is a third force, and it is the one that changed this spec's conclusion. The evidence this review started from was wrong, and the wrong version is committed text rather than something said in passing. `docs/scope/scope.md:326`, added in commit `b51cb83` (`docs(scope): record the eval harness verification and its first finding`), records that `control-one-gap` "scored `possible_match` 5 of 5 both times", and layers an inference on top of it, "a stable disagreement rather than noise", before handing the question to `/architect`. That is the claim this review was opened on and repeated without checking. It came from the reports' `summary` field, which reads `"possible_match, 5 of 5 succeeded"`. The `5 of 5` there is the success denominator, meaning every rerun returned a band rather than erroring; it is not the number that landed on that band. Reading the `distribution` field instead gives `control-one-gap` at `good_match` 1 and `possible_match` 4, then `possible_match` 5, and `key-domain-mismatch` at `weak_match` 3 and `not_a_match` 2, then `not_a_match` 5. A first draft of this spec was written on the misreading and reached a different conclusion, which a cross check on another model caught.

That correction matters because the two findings depend on it differently. `control-one-gap`'s case survives it: the verdict was `possible_match` both times and the pair failed both times, and the posting's own wording was written before any model ran. `key-domain-mismatch`'s case does not: 3 to 2 and then 5 to 0 is what a boundary looks like under ordinary variation, not what an undefined rule looks like. The consequence of not deciding carefully here is a change to the text that governs every real user's fit score, made on the strength of one noisy pair.

## Options considered

### Option 1: Revise the anchor text and correct the pairs the revision contradicts

Add two rules to `BAND_ANCHORS`: one saying what a stated requirement the candidate cannot demonstrate does to the band, weighed by how much of the role it represents, and one defining the `weak_match` and `not_a_match` line by whether anything the posting names appears in the candidate's history. Then re-argue all sixteen pairs and correct the ones the new wording contradicts.

**Pros**:

- Settles both questions in the text rather than leaving one of them to whatever the model decides on each new posting.
- Puts the rules where the drift guard pins them and the report hash covers them, so a later silent edit fails the free suite.
- Makes two pairs that currently cannot fail into pairs that can.

**Cons**:

- This was drafted in full and did not survive review. The overlap rule contradicts a fourth pair, `weak-match-shallow-overlap`, whose own committed rationale says the line "is not literal skill token overlap, which is zero here"; it would also apply literally to `stability-probe-generic`, a pair built to name no skills at all, whose probe rule fails on a single `not_a_match`. The count of pairs affected was between five and seven, not the three the draft claimed.
- The share of the role wording says "a substantial share of the role" and "a small part of the role", which breaks a constraint written into `rubric.ts` itself at line 58: "EVERY ANCHOR IS WRITTEN AGAINST THE VISIBLE POSTING, never against 'the role'". It also reuses "substantial", the exact word the draft's own rationale had rejected two paragraphs earlier as doing undefined work.
- Removing `boundary-seniority-gap`'s tolerance falsifies spec 0016's accepted AC-3, which requires that pair to hold more than one acceptable band, and leaves stale text in several files that describe the tolerance as load bearing.
- It lowers real users' bands on the most common posting shape there is, a list of requirements with one marked required, on the strength of sixteen invented pairs and no production measurement.

### Option 2: Correct the pair, leave the anchors alone, record the rejected rule

Treat `control-one-gap` as a wrong expectation rather than an anchor gap, since the existing `possible_match` text already describes it. Leave `BAND_ANCHORS` untouched, leave the `weak_match` and `not_a_match` gap recorded as spec 0016 already records it, and write down the rule that was drafted and why it was refused.

**Pros**:

- Changes nothing users see, and keeps the anchor hash stable so the two baseline runs stay comparable with everything after.
- Fixes what the evidence actually supports fixing, and no more.
- Costs five vendor calls to confirm rather than eighty, because only one pair moved.
- The rejected rule stays available with its reasons, so the next person to look at this starts where this one finished.

**Cons**:

- Leaves the `weak_match` and `not_a_match` line undefined, so `key-domain-mismatch` can still flip and `boundary-seniority-gap` still cannot fail.
- Settles the "required, not just exposure" question for one pair by argument rather than by a rule, so the next posting phrased that way gets whatever the model decides.
- Produces no product improvement. It corrects an instrument and records a refusal.

### Option 3: Change nothing, widen both pairs with `acceptableBands`

Leave the anchors and record both disagreements as genuine ambiguity by accepting more than one band on each pair.

**Pros**:

- Cheapest of all, and honest about two careful readers disagreeing.
- No paid run needed at all.

**Cons**:

- Spec 0016's own rule is that `acceptableBands` widens a real expectation rather than papering over a disagreement, and for `control-one-gap` it would be the second thing: the anchors do settle that case, so the disagreement is a mistake rather than an ambiguity.
- It would make three of sixteen pairs unable to fail on the boundaries that matter most, weakening the harness exactly where it just proved useful.

## Rationale

Option 2 was chosen because the forces in Context point at two different problems and only one of them has evidence behind it. `control-one-gap` is a mistake in the ground truth set. Re reading the posting, it does not merely mention Kubernetes among other requirements; it says the infrastructure half is what sets the role apart and that ownership rather than exposure is required. Against `possible_match`'s existing "a real part is unproven" and "arguing that the experience transfers rather than pointing at it", the model's reading is better supported by the posting's own words than the author's is, and it needs no new rule to justify. The author over weighted "the core of the work is clearly within reach" toward the backend half while the posting had already said which half defines the role.

Option 1 was drafted in full before being rejected, which is why it is described here in more detail than a discarded option usually deserves. It failed on three independent grounds, any one of which would have been enough. It contradicted a fourth committed pair and threatened a fifth, so its own claim to have re-argued the set was false. Its wording broke a constraint written in the file it was editing, and reused a word its own rationale had just rejected. And it falsified an accepted acceptance criterion in spec 0016 as a side effect nobody had noticed. A revision to the text that governs every user's fit score should not ship with three defects of that kind, and the fact that all three were found by a second model reading the draft, not by the model writing it, is the argument for having done that check.

The deeper reason for Option 2 is about what the evidence can support. `key-domain-mismatch` split 3 to 2 and then went 5 to 0. A rule written from that would be a rule written from noise, and it would lower real users' bands permanently to settle a question one pair asked once. The `weak_match` and `not_a_match` line genuinely is undefined, which spec 0016 recorded when it gave `boundary-seniority-gap` a tolerance for exactly that reason, and it stays undefined here. What would justify acting on it is a pair or a real posting that flips on that boundary repeatedly, and the honest position is to say so and wait rather than to legislate now.

There is one thing neither option could have fixed, worth stating so it is not later assumed. Feature 15's sixteen pairs were authored by reading `BAND_ANCHORS` directly, which spec 0016's own Follow up records at length. The harness measures whether the model reads this text the way a careful human reader of the same text would. It does not measure whether the text describes real hiring judgement well. Correcting a pair improves the first and says nothing about the second, and a revision that had been made to agree with the model would have needed to answer why that is evidence rather than accommodation. Option 2 avoids the question by correcting the pair on grounds that hold without reference to what the model returned: the posting's own sentence about which half defines the role was written before any run.
