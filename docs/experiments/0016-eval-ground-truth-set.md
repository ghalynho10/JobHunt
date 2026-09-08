# Experiments: eval ground truth set · spec 0016

Run 2026-09-08, during an advisor conversation about spec 0016, after feature
16's harness had shipped and scored the full sixteen pair set against a real
vendor for the first time.

Environments referred to below:

- **repository**: the `jobhunt` git history as of 2026-09-08, read with `git
  log`, `git show` and `grep` against the working tree. No database, no
  deployment and no vendor is involved, so unlike every other entry in this
  directory the result here stays true for as long as the history is not
  rewritten.

---

## 1. Were the sixteen ground truth pairs authored independently of `BAND_ANCHORS`?

**Why it matters.** Feature 16's harness scores every pair against the real
scorer and reports which ones fell outside their expected band. What a green run
actually proves depends entirely on where those expected bands came from. If
each was argued from `BAND_ANCHORS`'s own wording, a green run says the scorer
and the set agree about the reading of one text. If they were argued
independently of that text, the same green run would say something far stronger,
that the rubric captures real job fit. The two readings look identical in the
output and only one of them is available.

**What was run.**

```
git log --format='%h %ad %s' --date=short -- src/features/scoring/rubric.ts
git log --format='%h %ad %s' --date=short -- src/features/scoring/eval/pairs.ts
git log --format='%h %ad %s' --date=short \
  -S 'There is no significant stretch to argue' -- src/features/scoring/rubric.ts
git show 294ae9a -- src/features/scoring/rubric.ts
grep -on "That is [a-z_]*'s wording[a-z ]*" src/features/scoring/eval/pairs.ts
```

**Result: the set was written from the anchors, and the influence runs one way
only.**

```
rubric.ts   e22ba02  2026-09-06  add the anchored band rubric, fit score schema and prompt builder
            294ae9a  2026-09-07  add eval ground truth types and validator

pairs.ts    3a7fc32  2026-09-07  add the baseline eval pair and the validator guard test
            f1ed274  2026-09-07  add the ten single band accuracy eval pairs
            2b6b28f  2026-09-07  add the boundary, preference isolation and stability probe eval pairs
            f475ba4  2026-09-07  add the title preference isolation pair
            (plus three later ordering and rationale commits, all 2026-09-07)

-S 'There is no significant stretch to argue'  ->  e22ba02 only

pairs.ts:101  "That is strong_match's wording exactly"   (control-direct-match)
pairs.ts:117  "That is good_match's wording"             (control-one-gap)
pairs.ts:133  "That is not_a_match's wording exactly"    (control-unrelated-field)
```

The anchors existed a full day before the first pair. Their wording has never
been revised: the `-S` search on one anchor's own sentence returns only the
commit that created it. The one later commit touching `rubric.ts`, `294ae9a`,
belongs to spec 0016's own work and adds nothing but `export` in front of
`ADZUNA_SNIPPET_CHARACTERS`, together with the comment explaining why
`validateGroundTruth()` has to read that number rather than restate it; it does
not touch `BAND_ANCHORS`. Three rationales then quote the anchor wording back
verbatim.

**Ruled out, and how.**

- **Not circularity in both directions.** The usual worry about a rubric and its
  own eval set is mutual fitting, the anchors quietly reworded until the pairs
  pass. That did not happen and could not have: `BAND_ANCHORS`'s text has a
  single commit and has never changed, so nothing this set revealed has ever
  flowed back into it. Stating the direction matters, because "the rubric and
  the pairs were fitted to each other" and "the pairs were derived from a fixed
  rubric" have different remedies, and only the second is true here.
- **Not an inference resting on the three quoting rationales.** Those are the
  most direct evidence, not the whole of it. The ordering settles it on its own,
  since every pair postdates the anchors it is argued against, and spec 0016
  wrote the intent down at the time: `GroundTruthPair`'s own doc comment in
  `ground-truth.ts` states that `expectedBand` "IS DECIDED FROM `BAND_ANCHORS`'S
  OWN WRITTEN TEXT, BEFORE ANY MODEL RUN".
- **Not a departure from what spec 0016 intended.** The same doc comment gives
  the reason: a band read off a model's output "would make this data a
  description of the scorer rather than a measurement of it". Deriving the bands
  from the anchors was the deliberate and correct choice against that failure.
  What was never written down is the cost that choice carries, which is the
  finding here.
- **Not a defect with a fix available today.** Closing it needs an independent
  source of fit judgment to compare against, and the project has none: no real
  hiring outcomes, no outside recruiter panel, nothing but the anchors
  themselves.

**Conclusion.** Feature 16's harness proves that the scorer reads
`BAND_ANCHORS` the way a careful human reader of that same text would. It does
not prove that `BAND_ANCHORS` reflects valid real world judgment about job fit.
Those are different claims, the first is genuinely useful and is the one under
test, and the second has never been tested by anything in this repository. This
is a scope limitation rather than a defect, and nothing needs changing today.

What would actually close it is a genuinely blind second opinion: a person or a
model scoring the same raw postings and profiles with `BAND_ANCHORS` withheld
entirely, and the two sets of answers then compared. Rewriting or extending the
existing set would not close it, because any rewrite done by reading the anchors
inherits exactly the same dependency. Recorded as a Follow-up item in spec
0016's `index.md`, kept separate from the anchor drift item beside it: drift is
about the wording moving after this data was authored, this is about the data
never having been independent of that wording to begin with.
