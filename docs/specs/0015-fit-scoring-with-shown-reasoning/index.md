# 0015. Fit scoring with shown reasoning

**Date**: 2026-09-06
**Status**: In Progress

## Summary

This spec scores every job listing a search returns against the signed in user's own profile and shows the work: which skills matched, which were not mentioned in the posting, and a short written reason, sorted into one of five bands instead of a bare number. Because Adzuna only ever returns a 500 character excerpt of a posting, the design treats "not mentioned" as an honest, uncertain label rather than a confident claim that a skill is missing. Scoring runs on OpenAI through the router spec 0012 already built, fires all 20 listings at once so a search does not hang, and never runs at all for a profile with no skills and no work history yet.

## Context

See [rationale.md](rationale.md) for the full problem context: the verified 500 character Adzuna truncation, spec 0012's fixed vendor and call shape, the profile schema this feature reads, and the prompt injection risk a job posting carries as untrusted text.

## Requirements

**User stories**:
- As a job seeker, I want each search result scored against my own profile so that I can tell at a glance which listings are worth reading in full.
- As a job seeker, I want to see which of my skills matched and which were not mentioned in the posting, not just a number, so that I can judge the score myself rather than trust it blindly.
- As a job seeker with a profile that has no skills and no work history yet, I want to be told to add one rather than shown a score built on nothing.
- As the operator, I want a scoring failure to be visible and never mistaken for a working score, and a usage cap refusal to read differently from an actual failure.

**Acceptance criteria**:
- **AC-1**: `src/features/scoring/rubric.ts` defines five ordered, named bands (`strong_match`, `good_match`, `possible_match`, `weak_match`, `not_a_match`), each carrying a written anchor description sent verbatim in the prompt, so the model selects the closest anchored description rather than free floating a judgment (an anchored band rubric, not an open numeric range, matching scope.md's own wording).
- **AC-2**: Across the genuinely varied listings feature 15's ground truth set will author, scored results spread across at least three of the five bands rather than clustering on one. This is exercised by feature 16's eval harness once feature 15 exists, not by this feature's own unit tests, since it needs authored real world variety this feature does not carry on its own.
- **AC-3**: `callTier("ai_scoring", …)` is called exactly once per listing, never batched across listings in one call, matching spec 0012's settled call shape.
- **AC-4**: The prompt built for every listing states plainly that Adzuna truncates `descriptionSnippet` at 500 characters and marks a truncated description with a trailing "…"; the model is instructed never to assert that a skill is required by a specific posting unless the visible text actually says so, and never to treat an unconfirmed skill as absent from the posting either.
- **AC-5**: The score schema exposes `matchedSkills` (the caller's own skills whose name, or a clear synonym, appears in the listing's visible title or description) and `notMentionedSkills` (skills from the caller's own list that a role like this one would typically value, that do not appear anywhere in the listing's visible text). Both arrays are filtered after parsing to names that case insensitively match one of the caller's own `profile_skill` names; any other name the model returns is dropped before it reaches the UI, never displayed and never a reason to fail the whole call. Neither the schema field name nor any displayed label ever reads "missing skills"; the UI's label for `notMentionedSkills` states plainly that this is not a confirmed absence (`COPY-2`).
- **AC-6**: A `sponsorshipSignal` field is a required enum of `sponsors`, `does_not_sponsor`, or `not_stated`, resolved from whether the listing's visible text states a sponsorship stance explicitly. `not_stated` renders nothing on the card, the same visible outcome an absent field would have had, but as an explicit value rather than an omission a model could produce by accident. The signal is never used to compute or adjust the band, and when present (`sponsors` or `does_not_sponsor`) it renders as its own separate badge, distinct from the band badge (`COPY-6`).
- **AC-7**: A profile with zero `profile_skill` rows and zero `work_experience` rows is never scored. `/search` renders its plain, unscored result list (today's shape) plus a visible line linking to `/profile` to add skills or experience (`COPY-5`), and no `ai_scoring` call is made for any listing on that render. A profile with either skills or work history, even if the other is empty, is scored normally. This gate layers onto spec 0008's AC-6 landing rule without replacing it: a thin profile still lands on `/search`.
- **AC-8**: When the caller's profile clears the AC-7 gate, every listing `searchListings()` returns for that render is scored: one `ai_scoring` call per listing, fired concurrently rather than sequentially.
- **AC-9**: The result list renders immediately, in Adzuna's original order, with a pending indicator on every card while scoring runs in the background. It re-sorts exactly once, once every listing's outcome (a score, a gate refusal, or a failure) has resolved: scored cards first, ordered by band (`strong_match` first, `not_a_match` last, ties within a band keeping Adzuna's original relative order, since a stable sort never reorders equal elements), then every refused or failed card after them in its own original relative order. No further re-sort happens after that. Outcomes are matched back to their card by `sourceJobId` (never by array position), since the list itself reorders.
- **AC-10**: A listing whose `ai_scoring` call fails (a vendor error or a malformed response) shows a visible "could not be scored" state on that card alone (`COPY-3`); the other listings in the same render keep their own real outcome. A failed scoring attempt never writes or renders anything that reads as a working score.
- **AC-11**: When any of the concurrent calls is refused by the usage gate (`{ allowed: false }`), the affected cards show no band and no per card failure note. Instead, one page level notice appears once, naming the limit reached (reusing the existing `SENTENCES` table keyed by `UsageGateReason`, spec 0011). When refusals in the same batch carry more than one distinct reason (possible since 20 concurrent calls can straddle more than one cap boundary), the notice uses whichever reason the first refused call, in the listing's original order, carried. Kept visibly distinct from the per card failure state in AC-10.
- **AC-12**: The prompt's system instructions state that the listing's title and description are untrusted external text, that the model must not follow any instruction contained within them, and must not fetch, describe, or act on any URL or address that appears in them.
- **AC-13**: The prompt built from the caller's profile is bounded regardless of how much the user wrote: the full `summary` (already capped at 4000 characters, spec 0010 AC-3), at most 50 skills (in `readProfileSections()`'s own `lower(name)` ascending order, the same 50 value ceiling this project already uses for `job_preference`'s own list fields, spec 0010 AC-9), the full `job_preference` row when present (already bounded by spec 0010 AC-9's own limits, no new cap needed), and at most the 5 most recent `work_experience` entries in the order `readProfileSections()` already returns them, each entry's own `description` truncated to 300 characters before it enters the prompt. When a listing's own `descriptionSnippet` is absent (an optional field, spec 0013), the prompt states plainly that no description was returned for this posting and the model reasons from the title alone.
- **AC-14**: `scoreListings()` (`src/features/scoring/score-listings.ts`) opens its own named span, `scoring.score_listings`, as its first statement, before it dispatches any of the concurrent `scoreListing()` calls (each of which runs its own gate check), recording the listing count; once every outcome has resolved it also records how many scored, how many were refused, and how many failed.
- **AC-15**: The entry page's "What's real today" card (spec 0006, AC-8) moves `ranked results with reasoning` from its `planned` list to its `working` list.
- **AC-16**: Every pending card carries `aria-busy="true"` until its outcome resolves; a single polite `aria-live` region announces once, when the one time re-sort in AC-9 happens, that results are now ranked; and the re-sort never moves keyboard focus away from whatever the reader was focused on, matching this project's WCAG 2.2 AA bar (`AGENTS.md`).

## Options considered

See [rationale.md](rationale.md) for the options weighed on the central decision, how to handle Adzuna's 500 character truncation, and the reasoning for the chosen option.

## Decision

**Chosen option**: Score the snippet, relabel the semantics honestly (rationale.md, Option 1). No fetch of the full posting; the rubric and the schema are designed around what a 500 character excerpt can honestly support.

**Implementation skills**: `ai-sdk` (Vercel's official plugin skill; consulted indirectly, since this feature calls spec 0012's router rather than the AI SDK directly, and never imports an `@ai-sdk/` package itself, per spec 0012 AC-3's own guard) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.agents/skills/vercel-react-best-practices/`), specifically its Strategic Suspense Boundaries and Parallel Data Fetching rules, which this spec's sort once after all 20 resolve design applies directly · `sentry-nextjs-sdk` (`getsentry/sentry-for-ai`, `.agents/skills/sentry-nextjs-sdk/`), for the `scoring.score_listings` span.

## Rationale

Full reasoning, the options weighed, and references: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:
No new database table. A score is never persisted (see Consequences); it is an in memory value computed for one render and handed straight to the UI. Its shape:

| Field | Type | Notes |
|---|---|---|
| `band` | `"strong_match" \| "good_match" \| "possible_match" \| "weak_match" \| "not_a_match"` | Required. Selected against the anchored rubric in `rubric.ts` (AC-1). |
| `matchedSkills` | `readonly string[]`, ≤50 entries | Required, may be empty. Filtered to the caller's own `profile_skill` names; a model returned name not on that list is dropped (AC-5). |
| `notMentionedSkills` | `readonly string[]`, ≤50 entries | Required, may be empty. Same filtering as `matchedSkills`. Never rendered under a label implying confirmed absence (AC-5). |
| `reasoning` | `string`, ≤600 characters | Required. The written explanation shown on the card. |
| `sponsorshipSignal` | `"sponsors" \| "does_not_sponsor" \| "not_stated"` | Required. `not_stated` renders nothing on the card (AC-6). |

**State transitions**: none. Scoring is stateless per render, matching spec 0012's own router.

**API surface**:
| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `scoreListing()` (`src/features/scoring/score.ts`) | server function | `profile: ScoringProfile` (the bounded shape from AC-13), `listing: Listing` | `Result<{ allowed: true; value: FitScore } \| { allowed: false; reason: UsageGateReason }>` | inherited from `callTier()`, which verifies the caller through `checkUsageGate()`'s `getClaims()` before any vendor is reached | `session_missing`, `usage_gate_misconfigured`, `database_unavailable` (from the gate), `external_service_failed`, `response_malformed` (from the vendor call), all inherited unchanged from spec 0012 |
| `scoreListings()` (`src/features/scoring/score-listings.ts`) | server function | `profile: ScoringProfile`, `listings: readonly Listing[]` | `readonly ScoreOutcome[]`, one per listing, order preserved, each element is `scoreListing()`'s own `Result` | same as `scoreListing()`, per call | none of its own; each element carries its own `scoreListing()` outcome |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| `scoreListing()` | the band | `ai_scoring`'s structured output, resolved against the anchored rubric in `rubric.ts` |
| `scoreListing()` | `matchedSkills` / `notMentionedSkills` | `ai_scoring`'s structured output, filtered to the caller's own skill names (AC-5) |
| `scoreListing()` | `sponsorshipSignal` | `ai_scoring`'s structured output, one of the three required enum values |
| `scoreListing()` | `reasoning` text | `ai_scoring`'s structured output |
| `scoreListing()` | which profile is scored | the caller's own profile, read through `readOwnProfile()` + `readProfileSections()` (spec 0010), never a client supplied id |
| `scoreListing()` | which listing is scored | the `Listing` already parsed by `searchListings()` in the same render (spec 0013) |
| the thin profile gate | whether scoring runs at all | the count of `profile_skill` rows OR the count of `work_experience` rows, both already read by `readProfileSections()`; scoring runs unless both are zero |
| the bounded skills and work history in the prompt | which skills and which 5 entries are sent | `readProfileSections()`'s own existing order (skills: `lower(name)` ascending; work history: `ended_on desc nulls first, started_on desc, created_at desc`), each capped per AC-13 |
| the result list's pending versus resolved state per card | React state | a Suspense boundary, not a stored value |
| the sort order once resolved | which band ranks first, and where refused/failed cards land | the fixed band order in `rubric.ts` (`strong_match` highest), never alphabetical and never the model's own confidence; refused and failed cards always sort after every scored card (AC-9) |
| the cap reached notice | which sentence renders | `SENTENCES[reason]`, the existing table keyed by `UsageGateReason` (spec 0011), reused unchanged; the first refused call's reason when more than one occurs (AC-11) |
| the per card failure note | which cards get it | `scoreListing()`'s own `Result`, `isFailure()` checked per listing |
| which card an outcome renders on after the re-sort | the pairing key | `sourceJobId`, never the array index (AC-9) |

**Key invariants**:
- No call ever scores more than one listing (mirrors spec 0012's settled call shape, AC-3).
- `notMentionedSkills` never renders under any label implying confirmed absence.
- The band is decided by skill and experience alignment only. Stated preferences (`desired_titles`, `desired_locations`, `remote_preference`, `minimum_pay`) and the sponsorship signal are instructed to be context for the written reasoning only, never inputs the model uses to select the band itself. This is instruction level, not structurally enforced (the same limit AC-12's prompt injection defense accepts): nothing in the schema stops the model from letting a preference mismatch influence the band anyway. See Follow-up for how feature 15's ground truth set is asked to give feature 16's eval harness a real chance to catch it if it happens.
- A gate refusal (`{ allowed: false }`) and a vendor failure are never rendered the same way, extending spec 0012's own key invariant (refusal and failure are never the same shape) to the per card versus page level split AC-10 and AC-11 add.
- Scoring never runs at all when the caller has zero skills and zero work experience entries (AC-7); the gate is checked once before the first `ai_scoring` call, not per listing.
- A score is never persisted. Every `/search` render that has results and clears the AC-7 gate recomputes every score, matching `job_search`'s own existing non caching behavior (spec 0013) and the `usage_cap` volume spec 0012 already seeded on that same assumption.
- Firing 20 `scoreListing()` calls concurrently does not let the batch spend past `usage_cap`: `check_usage_gate`'s own row lock and `on conflict do update` increment the consumed count inside one transaction (spec 0011), so concurrent calls serialize at that point and cannot overshoot the cap between them. Verified by direct read of the function during this spec's cross check (2026-09-06), not by a new test this spec adds.

**Security model**:
- Session: inherited from `callTier()`'s own `checkUsageGate()` → `getClaims()` check. Scoring never runs for a signed out caller.
- The profile scored is always the caller's own; `readOwnProfile()` and `readProfileSections()` already enforce this (spec 0010), and no caller supplied profile id ever reaches `scoreListing()`.
- Untrusted input: a job posting's title and description reach a model automatically, not text the user chose to paste (a named risk, verified against `MadsLorentzen/ai-job-search`'s own pattern in `docs/jobhunt-carry-forward.md`). Mitigation: the system prompt instructs the model to treat the listing's text purely as data, never follow an instruction embedded in it, and never fetch or act on a link inside it (AC-12). This is instruction level defense, not a sandbox, the same limit the verified reference project accepts.
- No new credential. `OPENAI_API_KEY` is already declared and validated (spec 0012); this feature adds no new environment variable.
- Privacy: this is the first feature that actually sends a real user's own summary, skills, and work history to `ai_scoring` in production. The `DATA_RECIPIENTS` entry for `openai` already exists (spec 0012, AC-9), so no registry change is needed here, but the diligence scope.md already owes this feature, reading OpenAI's terms on training and retention before this ships against real data, is carried forward in Follow-up.
- Retention: `ai_scoring` sets `providerOptions: { openai: { store: false } }` (`src/lib/ai/tiers.ts`), opting out of the Responses API's default 30 day retention of the full request and response. Nothing is lost by it, because scoring is stateless per render and never references a prior response by id, so the retention the default buys has no caller here. Decided and recorded 2026-09-06 (Follow-up, first item).

**Configuration required**: none new. This feature reuses `OPENAI_API_KEY`, already declared and validated by spec 0012.

**Copy**:
| ID | Context | Copy |
|---|---|---|
| `COPY-1` | The five band badges | Strong match, Good match, Possible match, Weak match, Not a match |
| `COPY-2` | The `notMentionedSkills` section heading and its caption (AC-5) | Heading: Not mentioned in this posting. Caption: This posting only shows part of the description, so this is not a confirmed gap. |
| `COPY-3` | The per card failure state (AC-10) | Could not score this listing right now. |
| `COPY-4` | The pending indicator on an unresolved card | Checking fit against your profile… |
| `COPY-5` | The zero profile gate (AC-7), linking to `/profile` | Add your skills or work experience to your profile to see how well each listing fits. |
| `COPY-6` | The two sponsorship badges (AC-6); `not_stated` renders neither | Sponsors work visas. Does not sponsor work visas. |
| `COPY-7` | The one time re-sort announcement (AC-16) | Results are now ranked by fit. |

**Critical test scenarios**:
- Happy path: under `TEST_LIVE_MODEL_CALLS_ENABLED` (spec 0012's own gate), calling `scoreListing()` with a real bounded profile and a real fixture listing returns a parsed `FitScore` whose `band` is one of the five defined values, verifies **AC-1**, **AC-3**.
- Failure case, refusal: a `usage_cap` row zeroed for `ai_scoring` in a test causes every `scoreListing()` call to return `{ allowed: false, reason }` without reaching the vendor, and the page renders the single page level notice from AC-11, never a per card failure note, verifies **AC-8**, **AC-11**.
- Failure case, vendor error: a constructed vendor error classified by the router's own `classify()` surfaces as `external_service_failed`, and the affected card alone shows the "could not be scored" state while a sibling card with a successful outcome still renders its band, verifies **AC-10**.
- Thin profile: a profile with zero skill rows and zero work experience rows performs zero `ai_scoring` calls for a search that returns listings, and the page renders the unscored list plus the link to `/profile`; a profile with one skill and no work history, or one work history entry and no skills, scores normally, verifies **AC-7**.
- Truncation handling: building the prompt for a fixture listing whose `descriptionSnippet` ends in "…" includes the explicit truncation caveat from AC-4; this is a unit test on the prompt builder itself, needing no live call, verifies **AC-4**.
- Auth/permission: `scoreListing()` called with no valid session returns `session_missing` before any vendor is reached, inherited unchanged from `checkUsageGate()`.

## Build plan

_Progress ticked by `/develop` on 2026-09-06. Steps 4 and 6 were built at full
width in one step rather than as one listing then twenty: the thin thread's
value is catching an integration problem with one call instead of twenty, and
no live call could be made during this build (it needs
`TEST_LIVE_MODEL_CALLS_ENABLED` and real vendor keys), so the narrow slice
would have proved nothing the wide one does not._

1. [x] Write `src/features/scoring/rubric.ts`: the five band anchors (their exact wording), the Zod `fitScoreSchema` (`band` enum, `matchedSkills`, `notMentionedSkills`, `reasoning` capped at 600 characters, the three value `sponsorshipSignal` enum), the post-parse skill name filter, and the prompt builder taking a bounded profile and one listing, including the truncation caveat, the missing-description case, and the untrusted input instructions. Satisfies **AC-1**, **AC-4**, **AC-5**, **AC-6**, **AC-12**, **AC-13**, and is the anchor wording **AC-2** is later measured against.
2. [x] Write `src/features/scoring/score.ts`: `scoreListing()`, calling `callTier("ai_scoring", fitScoreSchema, { system, prompt })` with the prompt `rubric.ts` builds, returning its `Result` unchanged. Satisfies **AC-3**.
3. [x] Write `src/features/scoring/score-card.tsx`: the band badge, the matched and not mentioned lists, the reasoning, the optional sponsorship badge, plus the pending state and the per card failure state, taking a `ScoreOutcome | "pending"` prop so it renders every state this feature has from day one. Satisfies the display half of **AC-5**, **AC-6**.
4. [x] The thin end to end thread (this project's Tracer Bullet approach): extend the search page's `SearchOutcome` to read the caller's own profile, skill count, and work experience count through the existing `readOwnProfile()` / `readProfileSections()`, gate on both counts being zero (rendering the unscored list plus the `/profile` link, `COPY-5`, only then), and otherwise wrap a call to `scoreListing()` against the first listing only in a `<Suspense>` boundary whose fallback renders that one card's pending state (`COPY-4`), so the page is never blocked even in this first thin slice. Proves profile to score to card to Suspense end to end on one listing before scaling to all 20. Satisfies **AC-7**.
5. [x] Write `src/features/scoring/score-listings.ts`: `scoreListings()`, opening the `scoring.score_listings` span first, firing `scoreListing()` concurrently across every listing (`Promise.all`, since each call already returns a `Result` rather than throwing), tallying the scored, refused, and failed counts as span attributes once every outcome resolves. Register the span in `docs/observability/spans.md`. Satisfies **AC-8**, **AC-14**.
6. [x] Widen the thread from one listing to all 20: swap the single `scoreListing()` call from step 4 for `scoreListings()` inside the same Suspense boundary, whose fallback now renders the whole list unscored, in Adzuna's original order, with every card in its pending state (the Strategic Suspense Boundaries pattern named in Decision). Satisfies **AC-9**'s immediate render half.
7. [x] Add the resolved states: sort the outcomes by band once all have resolved (**AC-9**'s re-sort half), the per card failure state (**AC-10**), and the page level cap reached notice reusing `SENTENCES` (**AC-11**).
8. [x] Tests: the critical test scenarios above, the prompt builder's truncation unit test, and the thin profile gate.
9. [x] Move `ranked results with reasoning` from `planned` to `working` in `src/features/entry-page/about-section.tsx`. This sits outside this feature's own code area and nothing else in the build prompts it, the exact shape that left this same clause unmet for two days on feature 7 and had to be named explicitly again on features 9, 11, 12, and 14. Satisfies **AC-15**.

## Consequences

**Positive**:
- Every displayed claim is grounded in what the visible 500 characters actually say, or is honestly labeled as unconfirmed; the design does not assert a requirement gap the model cannot verify.
- Reuses spec 0012's router and spec 0010's profile queries unchanged. No new table, no new migration, no new credential.
- `scoreListings()`'s concurrent dispatch pattern is the shape feature 17 (cross vendor self check) can reuse directly for its own `ai_check` calls once it is designed.

**Negative / tradeoffs**:
- Scores are never cached. Every `/search` render that has results and clears the AC-7 gate spends up to 20 `ai_scoring` calls, the same non caching precedent `job_search` itself already accepts; a repeat view (a reload, a shared link, or browser back navigation) costs budget again exactly like feature 18's own open problem, now applying to a second gated call type rather than one.
- `notMentionedSkills` still requires the model to judge what a role like this one "would typically value," an inference the honest label does not remove, only flags. A wrong inference now reads as an honest, hedged guess rather than a confident false claim, which is the fix this spec makes; it is not a fix that removes the underlying judgment call.
- The band ignores stated preferences by design. A listing whose salary sits well below the caller's stated minimum, or that is on site when the caller wants remote, can still land in `strong_match`, since only skill and experience alignment drive the band.
- The full posting is never fetched. A skill genuinely required by a posting but never mentioned in its visible 500 characters is invisible to this feature: correctly reported as neither matched nor not mentioned, rather than wrongly reported as missing, but still unreported. This is an accepted information gap, not a closed one (see Follow-up).
- Sorting only once, after all 20 resolve, means the one visible reorder waits for the slowest of the 20 calls. The honest worst case is not one hung call but a vendor side outage during the batch: every card can sit at its pending indicator for the full 30 second per call timeout (spec 0012's `tiers.ts`), then settle as 20 individual failure states with no ranking at all. The page itself is never blocked, it renders immediately in unscored order, but a reader watching the list can wait the full 30 seconds for that outcome. No aggregate, shorter than 30 second deadline is added in this spec (see Follow-up); this is accepted rather than engineered around until real usage shows it matters.

**Neutral**:
- The five band names and their anchor wording are this spec's own first attempt. Feature 16's eval harness against feature 15's ground truth set is the actual mechanism to prove whether they discriminate real listings well, not this spec's own reasoning alone (AC-2).
- This is the first feature that actually sends a real user's profile data to `ai_scoring` in production. Spec 0012's own provisional vendor pick and its Follow-up items (the alias pinning trigger, the eval harness ranking) apply unchanged to this feature's calls.

## Follow-up

- [x] Verify OpenAI's terms on training and retention for API submitted content before this feature ships against real profile data in production. This is scope.md's own diligence owed to feature 14, carried forward unchanged; the vendor named is OpenAI, not Anthropic, per spec 0012's 2026-09-06 revision. **Resolved 2026-09-06, and the two halves resolved differently.** *Training*: confirmed already safe with no action. OpenAI has not used API submitted data to train or improve its models since 2023-03-01 unless a customer explicitly opts in, and nothing in this repo opts in, so the privacy notice's "not used to train models" claim stands unchanged (developers.openai.com/api/docs/guides/your-data, read 2026-09-06). *Retention*: needed a code change and got one. `ai_scoring` resolves to OpenAI's Responses API (the provider's default since AI SDK 5), whose `store` option defaults to `true`, and a stored request and response is retained as "Application State" for a minimum of 30 days. `src/lib/ai/tiers.ts` now sets `providerOptions: { openai: { store: false } }` on that tier, so a person's summary, skills and work history are no longer held for a month. Scoring is stateless per render (`## Feature design`, "State transitions": none) and makes one single step call with no tools, so nothing is lost by opting out. Locked by `src/lib/ai/tiers.test.ts`.
- [ ] Feature 17 (cross vendor self check) should reuse `scoreListings()`'s concurrent dispatch pattern for its own `ai_check` calls once it is designed; this spec establishes that pattern but does not build the check itself.
- [ ] If feature 16's eval harness later shows the five bands clustering rather than spreading (the condition **AC-2** defers to that harness), the band anchors in `rubric.ts` are the first thing to revise, not the vendor or any of this prompt's other instructions.
- [ ] The fetch full posting option (`defuddle` from `job_url`) is parked, not rejected forever. Revisit it only alongside a deliberate decision to add a headless browser to this project's stack, and only after asking Adzuna directly about automated redirect fetching rather than inferring a position from their terms' silence on it.
- [ ] Feature 18's own owed decision on what a repeat view of `/search` should cost also resolves this feature's repeat view cost for scoring, since both ride the same render. No separate fix is owed here.
- [ ] Feature 15's ground truth set should include at least one pair that varies stated preferences (title, location, remote, pay) while holding skills and experience fixed. This feature's own instruction to keep preferences out of the band is enforced only by the prompt, not the schema (see Key invariants); without a pair built specifically to isolate preferences from skills, feature 16's eval harness has no case that could catch preference driven band contamination even in principle.
- [ ] If real usage shows the full 30 second worst case (Consequences) happens often enough to matter, add an aggregate deadline shorter than the per call timeout, after which any listing still pending renders as a failure rather than waiting out its own call. Not built now: it trades completeness for responsiveness in a way no acceptance criterion here requires, and an abandoned call still spends its `usage_cap` unit whether or not the page waits for it.
