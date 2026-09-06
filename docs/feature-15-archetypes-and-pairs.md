# Feature 15 reference: archetypes and ground truth pairs

*Bring this into `/architect eval ground truth set`. These are starting points, not final — the architect pass may adjust the schema or specifics.*

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
| Backend/AI Engineer, 2–4 yrs, Python/AWS | Strong | Clean direct match — baseline sanity check |
| Mid-level role, missing one core piece (e.g. Kubernetes) | Moderate | Proves the middle band actually gets used |
| Mechanical Engineer role | Poor | Zero overlap — control for "does Poor even work" |
| Staff/Principal role, 8+ yrs, heavy leadership | Weak or Poor | Seniority cap tested from the opposite direction of archetype 2 |

**Archetype 2 — under-qualified seniority (the cap-rule test)**

| Posting | Expected band | Why this pair exists |
|---|---|---|
| Staff Backend Engineer, 8+ yrs, leadership, lists "Python" | Poor | **Key anchor.** Real skill overlap, seniority gap should cap it anyway |
| Entry-level role matching their real skills | Strong | Control — at the right level, skills carry normally |
| Mid-level (2–4 yr) role, slightly above them | Weak | Boundary case — is the cap hard, or does it soften for a small gap? |

**Archetype 3 — right seniority, wrong domain (the skills-alone test)**

| Posting | Expected band | Why this pair exists |
|---|---|---|
| AI/backend role, same seniority band | Poor | **Key anchor.** Seniority is fine, so Poor here has to come from skills alone |
| Data Analyst / Product Design role matching their real domain | Strong | Control for this archetype |
| Data Engineer role — adjacent domain, partial overlap | Moderate | A different flavor of Moderate — domain adjacency, not one missing skill |

## The two pairs that matter most

Archetype 2's first pair and archetype 3's first pair are load-bearing — they're what actually proves the seniority-caps-skills-grades-within-it rule works, rather than just asserting it. If either fails repeatedly (not just once — see the multi-run note below), that's the rubric's core rule breaking, not a minor miss.

## Don't forget, from the rest of tonight's conversation

- Scoring is non-deterministic (GPT-5.6 Luna can't run at `temperature: 0`). Run each pair multiple times (3–5) before calling a mismatch a real failure — a single adjacent-band flip is expected noise, not a regression.
- Postings should be copied as frozen text at labeling time, not live-linked — a live posting can change or expire, silently invalidating the ground truth.
- Expected bands are decided before seeing any model output, always.
