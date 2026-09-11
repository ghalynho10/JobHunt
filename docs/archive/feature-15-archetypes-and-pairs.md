# Feature 15 reference: archetypes and ground truth pairs

*Bring this into `/architect eval ground truth set`. These are starting points, not final — the architect pass may adjust the schema or specifics.*

*Updated: band system changed from 4 bands (Strong/Moderate/Weak/Poor) to 5 bands (Strong match/Good match/Possible match/Weak match/Not a match), per spec 0015's own decision that 4 bands risked concentrating variance at a hard boundary, and 3 bands risked collapsing most real listings into one middle band. Two pairs below are flagged unresolved — read the "Open questions" section before treating this as final.*

## Why three archetypes, not one

A ground truth set built from only one profile would only test whether the rubric works for that one person. These three are chosen specifically to isolate the two variables the rubric's seniority-caps-skills-grades-within-it rule depends on, so bias in either direction is checkable, not assumed away.

## The three archetypes

**Archetype 1 — "you"**
Your actual profile: mid-level AI/Software Engineer, 2–4 years, Python/AWS/data dashboards, web dev and Firebase/NoSQL. Free to build, doubles as a real signal on your own search.

**Archetype 2 — under-qualified on seniority, decent skill overlap**
0–1 years experience, knows Python and basic cloud concepts, no leadership or ownership history. Built specifically to test whether the seniority ceiling actually caps the band even when skills genuinely overlap.

**Archetype 3 — right seniority, wrong domain**
3–5 years experience (same band as archetype 1), but in a different skill set entirely — e.g. data analysis or product design rather than backend/AI engineering. Built to isolate skills-driven mismatches from seniority-driven ones.

## The ten pairs

**Archetype 1 — "you" (control group)**

| Posting | Expected band | Why this pair exists |
|---|---|---|
| Backend/AI Engineer, 2–4 yrs, Python/AWS | Strong match | Clean direct match — baseline sanity check |
| Mid-level role, missing one core piece (e.g. Kubernetes) | Good match | Still solid, one real gap — not a genuine toss-up |
| Mechanical Engineer role | Not a match | Zero overlap — control for "does the bottom band even work" |
| Staff/Principal role, 8+ yrs, heavy leadership | Weak match or Not a match — **unresolved, see below** | Seniority cap tested from the opposite direction of archetype 2 |

**Archetype 2 — under-qualified seniority (the cap-rule test)**

| Posting | Expected band | Why this pair exists |
|---|---|---|
| Staff Backend Engineer, 8+ yrs, leadership, lists "Python" | **Unresolved — see below** | **Key anchor.** Real skill overlap, seniority gap should cap it anyway |
| Entry-level role matching their real skills | Strong match | Control — at the right level, skills carry normally |
| Mid-level (2–4 yr) role, slightly above them | Possible match | Boundary case — a small gap now has a real middle band to land in, rather than being forced to Weak |

**Archetype 3 — right seniority, wrong domain (the skills-alone test)**

| Posting | Expected band | Why this pair exists |
|---|---|---|
| AI/backend role, same seniority band | Not a match (tentative — see below) | **Key anchor.** Seniority is fine, so a Not-a-match here has to come from skills alone |
| Data Analyst / Product Design role matching their real domain | Strong match | Control for this archetype |
| Data Engineer role — adjacent domain, partial overlap | Possible match | Domain-level uncertainty, not a single missing skill — a genuine toss-up, not just "good with a gap" |

## Open questions — resolve before treating this as final

**1. Archetype 2's key anchor is genuinely unresolved, not just unlabeled.** Real skill overlap (they have Python) plus a severe seniority gap (0–1 yrs vs. 8+ required) — does the seniority cap send this all the way to **Not a match**, or does the genuine overlap earn one notch up to **Weak match**? This is a substantive decision about how absolute the seniority ceiling actually is, not a wording choice. Whatever you pick here is effectively the rule's real definition, not just this pair's label.

**2. Archetype 3's key anchor is more resolved, but still worth confirming.** Unlike archetype 2's anchor, there's no stated skill overlap here — it's a clean domain mismatch. That argues for **Not a match** being the right call without much ambiguity. Flagged as "tentative" only because it's worth explicitly confirming rather than assuming, given its sibling anchor turned out to need real judgment.

**3. "Weak match" has no clean, unambiguous pair right now.** Every pair that could land there is one of the two flagged-unresolved anchors above, or archetype 1's fourth pair (also left open). If both anchors resolve toward Not a match, the ground truth set has a real coverage gap — nothing proves the model can produce a genuine Weak match at all. Worth either deliberately resolving one of the open pairs to Weak match, or adding an eleventh pair built specifically for it: something like a moderate (not severe) seniority gap paired with decent skill overlap — noticeably softer than archetype 2's anchor.

**4. "Possible match" as a label leans slightly optimistic for what should be a genuine coin-flip band.** Since this wording goes directly into the rubric the model reads, it's calibration, not cosmetics — worth confirming it's meant to read as neutral-middle before treating the current archetype-2 and archetype-3 "Possible match" pairs as settled.

## Preference-independence pairs (11 and 12) — required by spec 0015's follow-up, not yet built

Spec 0015's own follow-up notes require at least one test case proving pay, location, and remote-status **do not** move the band — only skills and seniority should. None of the ten pairs above test this; all of them vary skill/seniority while holding everything else fixed, never the reverse. Confirmed missing from this doc directly (Claude Code cross-checked scope.md's feature 15 description, which only says "cover the full range of good fits to bad fits" — it doesn't carry this requirement forward either, so it has to be stated explicitly to whoever runs `/architect eval ground truth set`, not assumed to be inherited).

**The two pairs, using archetype 1 ("you") and its existing Strong-match posting as the skill basis:**

| Posting | Expected band | Why this pair exists |
|---|---|---|
| Backend/AI Engineer, 2–4 yrs, Python/AWS — pay, location, and remote-status all match the profile's stated `job_preference` | Strong match | Baseline — same skill match as the existing archetype-1 pair 1 |
| Identical posting, same skills/seniority — but pay below the profile's stated minimum, location outside `desired_locations`, on-site instead of the stated `remote_preference` | Strong match (same as above) | **The actual test.** If this comes back lower than the pair above, preferences are leaking into the band — a real bug, not sampling noise |

**One thing this pair-pair needs that didn't exist before: archetype 1 needs an explicit `job_preference` defined.** The archetypes as written only specify skills, seniority, and domain — none currently state desired pay, location, or remote preference. That has to be decided (even arbitrarily, e.g. "remote preferred, $120k minimum, Atlanta or remote only") before these two pairs can actually be written, since the whole test depends on one version matching that preference and one version violating it.

## The two pairs that matter most

Archetype 2's first pair and archetype 3's first pair are load-bearing — they're what actually proves the seniority-caps-skills-grades-within-it rule works, rather than just asserting it. That's exactly why both are flagged unresolved above rather than given a default label. If either fails repeatedly (not just once — see the multi-run note below) once you do settle on an expected band, that's the rubric's core rule breaking, not a minor miss.

## Don't forget, from the rest of tonight's conversation

- Scoring is non-deterministic (GPT-5.6 Luna can't run at `temperature: 0`). Run each pair multiple times (3–5) before calling a mismatch a real failure — a single adjacent-band flip is expected noise, not a regression.
- Postings should be copied as frozen text at labeling time, not live-linked — a live posting can change or expire, silently invalidating the ground truth.
- Expected bands are decided before seeing any model output, always.
