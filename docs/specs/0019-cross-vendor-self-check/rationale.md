## Context

This feature is scope row 17, the one remaining piece of the project's originally stated AI design: "the same logic as cross model code review, applied one layer down, inside the AI pipeline itself" (`docs/archive/jobhunt-idea-brief.md`). Spec 0012 already built the mechanism this needs, a router tier named `ai_check` fixed to a vendor (Google, Gemini 3.5 Flash-Lite) different from `ai_scoring`'s (OpenAI, GPT-5.6 Luna), with its own usage cap seeded at the same volume as scoring on a provisional sample rate of 1.0. Spec 0015 then built the thing this feature checks: `scoreListing()`, whose `matchedSkills` field is already filtered to names that exist in the caller's own profile, so a skill cannot be fabricated on the profile side. What it cannot rule out is the listing side: Adzuna returns only a 500 character excerpt (spec 0015's own central constraint), and a model can claim a skill matched when the excerpt never actually said so.

Two decisions were explicitly left open by earlier specs for this one to make: spec 0012's Follow-up asks this feature to decide `ai_check`'s real sample rate, and spec 0015's Follow-up names `scoreListings()`'s concurrent dispatch pattern as the shape this feature should reuse. Both are resolved in `index.md`.

## Options considered

### Option 1: Narrow grounding check on matched skills, chained per listing, same reveal wait (chosen)

The check receives only the listing text and the claimed skill list, asks whether each is grounded, and runs immediately after that listing's own score resolves, inside the same wait the reveal already has. A flagged skill is dropped from what renders; a check that could not complete renders as unverifiable.

**Pros**:
- Small, mechanical, specifiable input and output; matches scope.md's own wording ("cite skills present in the listing") exactly rather than a broader, harder to bound task.
- One reveal, one wait, no new focus restoration or announcement case on top of spec 0015's already carefully built AC-16/AC-17 mechanism.
- Reuses `scoreListings()`'s concurrent dispatch shape directly, as spec 0015's own Follow-up anticipated.

**Cons**:
- Two chained 30 second-class vendor calls per listing raises the worst case wait before a card settles; this is why AC-6 shortens `ai_check`'s own timeout rather than accepting the shared default.
- Checking only the skill list, not the free text reasoning, leaves a fabricated claim outside `matchedSkills` (a confident sentence in the prose itself) uncaught. Accepted: the reasoning prose is advisory text, not a structured claim the UI treats as fact the way a skill chip is (though a caveat is added over that prose when a flag hits, see AC-13).

### Option 2: Check the whole reasoning prose, not just matched skills

Send the full written `reasoning` string to the check vendor and ask it to flag any unsupported claim anywhere in it, not only skill names.

**Pros**:
- Wider coverage; a fabricated claim outside the skill list would also be caught.

**Cons**:
- No natural pass or fail shape: a paragraph either has or does not have an unsupported clause, which is a much harder judgment for a second small model to make consistently than "is this skill name grounded". A vague, unhelpful check is worse than a narrow one that actually works.
- Larger prompt into a second vendor for a task with no defined success criterion, raising cost and the check's own hallucination risk without a way to bound it.

### Option 3: Progressive check, second reveal wave after scores are already shown

Show ranked scores as soon as scoring resolves (today's reveal, unchanged), then patch check results into cards as they complete afterward.

**Pros**:
- Faster first paint; the reader sees a ranked list without waiting for the check at all.

**Cons**:
- Adds a second visible DOM mutation after spec 0015's reveal, reopening the exact focus restoration (AC-17) and announcement (AC-16) questions that reveal was carefully built to answer once. A second, smaller version of that problem is still that problem.
- A reader who glances at a card in the gap between the two waves sees an unverified claim rendered exactly like a verified one, with no visual difference, which is a worse failure mode than a longer wait with an honest state.

## Rationale

Option 1 is the only one of the three that keeps the check inside what it can actually verify well. A matched skill is a discrete, checkable claim: it is either present in the given text or it is not. Free text reasoning has no such boundary, which is why Option 2 was rejected even though it promises broader coverage; a check with no clear pass or fail condition is not a check, it is a second opinion with no defined disagreement.

The reveal timing forced the harder tradeoff. Option 3's progressive reveal is genuinely faster to first paint, but spec 0015 already paid a real cost building AC-16 and AC-17 correctly (the entry page's own carried forward record notes a repeat search wiping visible results as exactly the kind of defect a rushed reveal produces), and reopening that mechanism for a second wave risks the same class of defect a second time. Keeping one reveal, and shortening `ai_check`'s own timeout (AC-6) to bound the added wait, accepts a slower worst case in exchange for not touching a mechanism that took real effort to get right once already.

Three further decisions, each argued against a real alternative rather than settled by default:

**The reasoning prose caveat (AC-13).** A flagged skill's chip is removed, but the scorer's own `reasoning` text often names that same skill in prose, and nothing about removing a chip touches that sentence. Suppressing the reasoning entirely when a flag hits was considered and rejected: it discards text that may be almost entirely accurate apart from one clause, and the excerpt sent to the model is itself only 500 characters, so an "ungrounded" claim is often a claim grounded in text nobody sent to the model rather than a false one. A caveat rendered above the unedited reasoning, worded as a verification limit rather than an accusation, keeps the model's own text intact (this project's store raw, format at render rule) while warning the reader before they read the sentence it qualifies, not only after in a separate chip note.

**No page level notice for a misconfigured check tier.** A `usage_gate_misconfigured` failure is structurally a `Failure`, not a refusal, so it never trips AC-9's reasoning (which is about refusals specifically) and every checkable listing in the batch renders the same per card unverifiable note, indistinguishable from an ordinary vendor outage. Extending spec 0015's AC-11 page level notice mechanism to cover this case was considered, and rejected for two reasons: spec 0015 is an accepted spec, and editing what an accepted spec decides is a deliberate `/architect` action on that spec, not something to fold into a different feature's build; and a misconfiguration is an operator bug that should be caught before it reaches a real user, not a routine state worth its own UI. Each occurrence still reports itself to Sentry individually regardless of this choice, since this project's error model reports every `Failure` on construction, so operator visibility does not depend on a page level notice.

**No special handling for a card where every claimed skill gets flagged.** AC-12 forbids a check outcome from ever changing the band, so this case can show a high band with zero currently visible matched skills. A targeted exception (a caveat line specifically for this case, without changing the band value) was considered, but is unneeded once AC-13's reasoning caveat exists: the caveat, the emptied matched list, and `COPY-9`'s note naming every removed skill together already tell the reader exactly what happened. Adding a fourth signal on top would repeat what three already say. This conclusion is contingent on AC-13 shipping; had the reasoning caveat been rejected, this case would have needed its own targeted handling instead.
