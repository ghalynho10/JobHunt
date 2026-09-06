# Feature 14 v2: extraction + deterministic scoring architecture

*Captured: September 2026. Status: v1.5/v2 idea, not v1 — v1's single-call scorer ships first, proves the concept, then this is the natural next iteration.*

## The core shift

v1 does everything in one model call: read the posting, read the profile, judge the fit, return a band. This proposal splits that into three stages — two narrow extraction calls, one deterministic comparison.

## Stage 1 — Extract the posting's requirements

A model reads the raw posting and returns structured data, not a judgment:

```
requirements: [
  {skill: "Python", tier: "core"},
  {skill: "5+ years experience", tier: "core"},
  {skill: "Docker", tier: "nice-to-have"},
  {skill: "Kafka", tier: "nice-to-have"}
]
```

Each requirement tagged core vs. nice-to-have. No comparison to any candidate happens here.

## Stage 2 — Extract the profile's facts

Same treatment, independently, on the other document:

```
candidate: {
  skills: ["Python", "PostgreSQL", "AWS"],
  years_experience: 3,
  domain: "backend engineering"
}
```

Stages 1 and 2 don't depend on each other — both are pure extraction from one document each.

## Stage 3 — Compute the band with deterministic code, not a model call

Given Stage 1 and Stage 2's structured output, plain code applies the seniority-cap rule and skills-weighting logic. Same inputs, same output, every time. No prompt, no model, no variance.

## Why this is a real architectural upgrade, not just more steps

- **Likely reduces the determinism problem, but this is a hypothesis feature 14's harness needs to confirm, not an assumed fact.** v1's fix was "widen the bands to absorb noise." The bet here is that extraction ("does this posting mention 5 years") is a narrower, more stable question for a model than holistic judgment ("is this a strong fit") — but a badly written posting can make "is Docker core or nice-to-have" genuinely ambiguous too. The judgment may move to Stage 1 rather than disappear. Worth measuring variance at each stage once built, not assuming Stage 1/2 are meaningfully more stable than v1's single call.
- **Ground truth gets easier to author, not harder.** Two eval surfaces instead of one: does Stage 1 correctly tag core vs. nice-to-have, and does Stage 3 (given known-correct structured input) compute the expected band — the second one is a plain unit test, not an LLM eval at all, and dissolves the "author ranges before seeing output" problem entirely, since there's nothing to calibrate against once the function is deterministic.
- **Failures become diagnosable by stage.** When a result looks wrong, check which stage failed — extraction missing that Docker was optional, or the weighting logic mishandling a correct extraction. v1's single call gave no way to localize the problem this way.

**Open question, worth verifying before this gets designed for real: does the search data source (Adzuna, per feature 11) provide full posting text or a truncated snippet?** If it's a snippet, extraction only ever sees part of the actual requirements — and a three-stage pipeline makes that worse than v1's single call, since Stage 3 computes a confident band from an incomplete Stage 1 output with no way to know what it's missing. Not confirmed either way yet; check `adzuna.ts` / feature 11's actual spec before assuming full text is available.

## Multi-model agreement — where it fits, and where it doesn't

Ensembling the *entire* pipeline across models would multiply the highest-volume tier's cost — not worth it. Ensembling **Stage 1 specifically**, across two vendors, is cheap and useful:

- Two models agreeing on core vs. nice-to-have is a real confidence signal.
- Disagreement is specific and actionable ("one model thinks Kafka is core, one thinks it's optional") rather than a vague "the models don't agree on the vibe."
- Disagreement cases are naturally good candidates to pull into the ground truth set — a mechanism for *discovering* hard test cases, not just inventing them by hand.

## The AI engineering framing, worth keeping when this goes to architect

Moving Stage 3 into deterministic code isn't a retreat from AI engineering — knowing which parts of a problem need semantic understanding (extraction) versus which are a rules problem once inputs are structured (comparison) is itself the judgment call. The overall shape — decomposing one opaque end-to-end model call into narrower LLM stages connected by deterministic logic — matches what the field calls **compound AI systems**, generally considered a more mature way to build serious LLM applications than a single monolithic prompt, specifically because each piece becomes independently testable.

The eval surface gets more sophisticated, not smaller: Stage 1/2 need extraction-accuracy ground truth (closer to precision/recall on structured fields than blunt band-matching), and multi-model disagreement-as-signal is a real, respected technique, not decoration.

## What this changes elsewhere

- **Chrome extension idea:** unchanged in scope — it calls feature 14's API regardless of which version is live, and gets the more thorough scoring automatically once v2 ships. No extension-side redesign needed.
- **Eval-tooling idea (parked, post-JobHunt):** gains two concrete candidate rules worth remembering at design time — (1) "disagreement between independent models signals where to prioritize labeling effort" as a discipline rule, and (2) extraction-accuracy evaluation as a genuinely different shape from end-to-end classification evaluation. Also worth flagging: a subtle, systematic bias in Stage 1 extraction is a live example of the "correct per-instance, wrong in aggregate" failure category already noted as a candidate shape for that project.

## Sequencing

v1 (single-call scorer) ships first, proves the concept end to end against the harness. This is the v1.5/v2 iteration once the basics are solid — not a redesign blocking v1.
