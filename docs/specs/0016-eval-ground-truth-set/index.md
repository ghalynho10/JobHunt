# 0016. Eval ground truth set

**Date**: 2026-09-07
**Status**: In Progress

## Summary

This spec defines the authored data feature 16's eval harness will run against: four invented candidate profiles (never a real person's data) and fifteen fixed pairs of one profile against one job posting, each with a band decided from the rubric's own written wording before any model is asked. It fixes a real gap in an earlier draft: the draft assumed the rubric caps a candidate's band by seniority, and that rule is not actually written anywhere in `rubric.ts`. Where the rubric's wording genuinely cannot settle one exact band on its own, the pair carries a range of acceptable bands instead of a single invented answer, and the gap is handed to spec 0015 to consider closing later.

## Context

See [rationale.md](rationale.md) for the full problem context: why a ground truth set is needed at all, the options weighed for this pair set's shape, and the rejected paths.

## Requirements

**User stories**:
- As the person maintaining the scoring rubric, I want a fixed set of profile and posting pairs with a band decided in advance, so a later prompt or model change can be checked against real expectations instead of a fresh read of the output.
- As the person running feature 16's harness, I want to know which pairs allow more than one acceptable band, so a run does not report a genuine rubric ambiguity as a scoring bug.
- As the person maintaining spec 0015's rubric, I want any gap the ground truth set finds in the anchor wording written down plainly, so it can be closed on purpose rather than guessed at again later.

**Acceptance criteria**:
- **AC-1**: `src/features/scoring/eval/archetypes.ts` defines at least four candidate archetypes. Each is a fully invented person: no real name, no real employer, no text traced back to any real person's history. Each clears spec 0015's AC-7 scoring gate (at least one skill or one work history entry). Each represents a plainly different career shape from the others (documented in a short `description` field, separate from the `summary` text actually sent to the model).
- **AC-2**: Across the full pair set, every one of the five bands (`strong_match`, `good_match`, `possible_match`, `weak_match`, `not_a_match`) appears as the `expectedBand` or inside the `acceptableBands` of at least one pair. Wherever `rubric.ts`'s written anchor text alone can support one confident answer, the pair states a single exact `expectedBand`, not a range.
- **AC-3**: At least one pair is built specifically around a severe experience or seniority shortfall paired with a genuinely overlapping named skill. Because `BAND_ANCHORS` (`rubric.ts:69`) names a seniority expectation only inside `strong_match` and states nothing about how a severe shortfall elsewhere should weigh against one overlapping skill, this pair's `acceptableBands` holds more than one band rather than asserting a single invented answer, and its `rationale` field states the ambiguity plainly and points at spec 0015 as the place to resolve it.
- **AC-4**: At least two pairs share one archetype and near identical posting skill and experience requirements, differing only in whether the posting's stated location, on site or remote language, and pay figure, all written into `descriptionSnippet` and `location` (the two fields, alongside `title` and `companyName`, that `buildScoringPrompt` sends to the model; salary fields are never sent, so the pay conflict has to live in `descriptionSnippet`'s text, never in `salaryMin`/`salaryMax`), match or conflict with that archetype's own `preferences` (which the prompt does send, `rubric.ts:437-463`). Both pairs carry the same `expectedBand`. A harness run scoring them differently is evidence that a stated preference moved the band, which spec 0015's own instructions forbid.
- **AC-5**: At least one pair is tagged `stability-probe`: a posting whose `descriptionSnippet` states no concrete requirement, skill, or seniority language at all, authored close to the 500 character Adzuna ceiling (not a short snippet with a decorative ellipsis appended), and ending in the literal ellipsis character U+2026, the exact character `buildScoringPrompt`'s own check reads (`descriptionSnippet.trimEnd().endsWith("…")`, `rubric.ts:490`) to route a listing into its cut off branch. The near full length matters as much as the character itself: only then is `buildScoringPrompt`'s own claim, "this is the first 500 characters of a longer description", actually true of this fixture, rather than a mismatch between what the prompt asserts and what the snippet really contains. Its data records the real instability spec 0015's Follow up already observed for this exact input shape (the same excerpt scoring `strong_match` three times and `possible_match` six times in one 2026-09-06 render) rather than asserting one confident band. `validateGroundTruth()` checks that every `stability-probe` tagged pair's `descriptionSnippet` ends in U+2026, since a plain three period `...` would silently land the pair in the untruncated branch and defeat the point of the pair.
- **AC-6**: Every archetype's `profile` field is exactly a `ScoringProfile` (`src/features/scoring/rubric.ts:259`). Every pair's `listing` field is exactly a `Listing` (`src/features/search/adzuna.ts:162`), authored as frozen literal text, never a live Adzuna fetch, with `descriptionSnippet` never exceeding the 500 character `ADZUNA_SNIPPET_CHARACTERS` ceiling `rubric.ts` already names.
- **AC-7**: The archetypes and pairs live as typed TypeScript modules under `src/features/scoring/eval/`, not inside a `.test.ts` file and not embedded in feature 16's own harness code, so a malformed entry is a compile error against the app's own `ScoringProfile`, `Listing`, and `Band` types rather than a runtime surprise.
- **AC-8**: A pure `validateGroundTruth()` function catches what TypeScript's structural typing cannot: a duplicate id, a pair whose `archetypeId` names no real archetype, a band missing from every pair's `expectedBand` and `acceptableBands`, a `descriptionSnippet` longer than 500 characters, an `acceptableBands` that omits its own `expectedBand` or holds fewer than two bands, a `stability-probe` tagged pair whose `descriptionSnippet` does not end in the literal U+2026 character, and the absence of a `preference-isolation` or `stability-probe` tagged pair. Each returned issue names which check failed and which id, band, or tag triggered it (the `GroundTruthIssue` shape below). A committed guard test asserts it returns no issues for the current, real data, and separately asserts, against deliberately malformed inline fixtures, that each of these checks actually fires on its own broken case, not only that the real data happens to pass. Running under `pnpm test`, so an edit that silently narrows the set, or a validator that silently stops checking something, both fail the unit suite.

## Options considered

See [rationale.md](rationale.md).

## Decision

**Chosen option**: Option 2, four fully fictional archetypes with every expected band traced to the rubric's own written text, and a widened tolerance for the one case that text cannot settle alone (rationale.md has the full comparison against reusing the earlier three archetype draft as is, and against blocking this feature on a spec 0015 amendment first).

## Rationale

Full reasoning and the rejected options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

| Entity | Field | Type | Notes |
|---|---|---|---|
| `EvalArchetype` | `id` | `string` | Unique, kebab case, e.g. `direct-fit-control`. |
| | `label` | `string` | Short human name for the archetype. |
| | `description` | `string` | One or two sentences on the career shape and why this archetype exists. Never sent to the model. |
| | `profile` | `ScoringProfile` | Exactly the type `rubric.ts:259` already defines: `summary`, `skills`, `experience`, `preferences`. |
| `GroundTruthPair` | `id` | `string` | Unique. |
| | `archetypeId` | `string` | Foreign key to `EvalArchetype.id`. Many pairs per archetype. |
| | `listing` | `Listing` | Exactly the type `adzuna.ts:162` already defines. Only `title`, `companyName`, `location`, `descriptionSnippet` are load bearing to scoring (per `buildScoringPrompt`); the remaining fields (`source`, `sourceJobId`, `url`, salary fields, `postedAt`) are inert plumbing values, set the same way the project's own `score.test.ts` already sets them for a fixture listing. |
| | `expectedBand` | `Band` | The single best answer. |
| | `acceptableBands` | `readonly Band[]`, optional | Present only on a pair the anchor text cannot narrow to one band alone (AC-3). Always includes `expectedBand` itself and holds at least two bands; never a one element list standing in for an exact expectation. Absent means only `expectedBand` counts as a pass. |
| | `tags` | `readonly string[]` | Free vocabulary; at minimum drawn from `control`, `preference-isolation`, `boundary`, `stability-probe`. |
| | `rationale` | `string` | Why this band, written against `BAND_ANCHORS`'s own wording, before any model run. |
| `GroundTruthIssue` | `kind` | `"duplicate-id" \| "unknown-archetype-id" \| "band-not-covered" \| "snippet-too-long" \| "invalid-acceptable-bands" \| "missing-required-tag" \| "stability-probe-not-truncated"` | A closed union, so a new check cannot be added under free text with nothing ever matching it. |
| | `subject` | `string` | The offending id, band, or tag. |
| | `message` | `string` | Human readable detail, e.g. which `archetypeId` resolved to nothing. |

No database table. No migration. Nothing here is read at request time; it is committed data read only by feature 16's own harness command.

**State transitions**: none, static authored data.

**API surface**:
| Function | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `ARCHETYPES` (`src/features/scoring/eval/archetypes.ts`) | data export | none | `readonly EvalArchetype[]` | none, dev tooling only | none |
| `PAIRS` (`src/features/scoring/eval/pairs.ts`) | data export | none | `readonly GroundTruthPair[]` | none | none |
| `validateGroundTruth()` (`src/features/scoring/eval/ground-truth.ts`) | pure function | `archetypes`, `pairs` | `readonly GroundTruthIssue[]` (empty means valid) | none | never throws; a broken invariant is a returned issue, not a thrown error |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Feature 16's harness scoring a pair | which profile is sent | `ARCHETYPES.find(a => a.id === pair.archetypeId).profile`, never a database read (AC-7) |
| Feature 16's harness judging a run | the pass or fail expectation | `pair.expectedBand`, widened by `pair.acceptableBands` when present (AC-2, AC-3) |
| Authoring the preference isolation pair's conflicting posting | which facts must conflict | the archetype's own `preferences` object: its `desired_locations`, `remote_preference`, and `minimum_pay` name exactly what the conflicting posting's `location` and `descriptionSnippet` text must contradict (AC-4) |
| The guard test | which invariants must hold | `validateGroundTruth()`'s own checks: unique ids, resolvable `archetypeId`, full band coverage, both required tags present (AC-8) |

**Key invariants**:
- No archetype or pair ever contains a real person's data or a real employer name; every organization named is invented (AC-1). This matters beyond the project's own fixtures rule: every archetype is sent to OpenAI on every harness run, from a public repository.
- Every archetype clears spec 0015's AC-7 gate (at least one skill or one work history entry); an archetype clearing neither would never be scored and would produce no usable pair.
- `expectedBand` and any `acceptableBands` are decided by reading `BAND_ANCHORS`'s written text alone, before any model call is made against that pair. No pair encodes a rule the anchors do not state (in particular, no seniority ceiling beyond what `strong_match`'s own wording names).
- **Archetypes are authored and committed in full before any posting that pairs with them is written.** This is a process invariant, not one code can check: writing a profile and its matching posting together risks tuning the posting to a profile that is still open for editing, especially for a control pair whose whole point is an unforced, honestly independent match. The Build plan below orders the work to keep this true.
- `acceptableBands`, when present, always includes its own `expectedBand` and holds at least two bands; it is used only where the anchor text itself cannot honestly narrow to one band (AC-3), never as a way to avoid reasoning a pair through carefully.
- A `descriptionSnippet` is always frozen literal text, never a live Adzuna fetch, and never exceeds 500 characters.

**Security model**: No user data, no session, no database access. Every value here is either static authored text or read by feature 16's own harness command, never by a request path. The only real exposure is that every archetype's `summary`, `skills`, and `experience` text reaches OpenAI on every harness run, which is why AC-1's no real data rule is load bearing rather than a formality.

**Configuration required**: none new.

**Critical test scenarios**:
- Happy path: `validateGroundTruth(ARCHETYPES, PAIRS)` returns no issues against the committed data, verifies **AC-8**.
- Failure case: a pair referencing an `archetypeId` that names no real archetype, or a band absent from every pair's `expectedBand` and `acceptableBands`, is caught by `validateGroundTruth()` and fails the guard test, verifies **AC-8**.
- Data shape: a pair whose `descriptionSnippet` is not a string, or whose `expectedBand` is not one of `BANDS`, fails at compile time rather than at runtime, since both are typed directly against `rubric.ts`'s own exports, verifies **AC-6**, **AC-7**.

## Build plan

This project's default build approach is Tracer Bullet (a thin end to end slice proven before scaling). Applied here: prove the whole shape (one archetype, one pair, one passing validator and guard test) before authoring the remaining thirteen pairs, rather than writing all four archetypes and fifteen pairs first and finding a schema problem at the end.

1. Export `ADZUNA_SNIPPET_CHARACTERS` from `rubric.ts` (a one line change; its own comment already anticipates "the truncation check" as a future consumer). Write `src/features/scoring/eval/ground-truth.ts`: the `EvalArchetype`, `GroundTruthPair`, and `GroundTruthIssue` types (importing `ScoringProfile`, `Band`, and `ADZUNA_SNIPPET_CHARACTERS` from `rubric.ts`, `Preferences` from `@/features/profile/queries`, and `Listing` from `adzuna.ts`), and the pure `validateGroundTruth()` invariant checker, including the description length check against that constant. Satisfies **AC-6**, **AC-7**, the type half of **AC-8**.
2. Author the `direct-fit-control` archetype alone in `archetypes.ts`, including its `preferences` (needed later for the isolation pair), and commit it on its own before writing a single posting against it, per the authoring order invariant above.
3. Author the one baseline pair (`control-direct-match`, table below) in `pairs.ts` against the now committed archetype. Wire `ground-truth.test.ts` to call `validateGroundTruth()` against this one archetype and one pair, including the deliberately malformed fixture assertions **AC-8** requires, and get it green under `pnpm test`. This is the thin thread: one archetype, one pair, one passing and one deliberately failing check, before scaling. Satisfies the first slice of **AC-1**, **AC-2**, **AC-7**, **AC-8**.
4. Author the remaining three archetypes (`severe-experience-gap`, `right-level-wrong-domain`, `adjacent-insufficient-depth`, table below), each fictional, each clearing spec 0015's AC-7 gate. Satisfies the rest of **AC-1**.
5. Author the remaining single band accuracy pairs (control and clean cases in the pair table below) across all four archetypes. Satisfies the rest of **AC-2**.
6. Author the `boundary-seniority-gap` pair with its `acceptableBands` and its rationale naming the anchor gap for spec 0015. Satisfies **AC-3**.
7. Author the two `preference-isolation` tagged pairs against `direct-fit-control`'s committed `preferences`. Satisfies **AC-4**.
8. Author the `stability-probe-generic` pair: `descriptionSnippet` written close to the 500 character ceiling, entirely generic corporate boilerplate with no concrete requirement anywhere in it, ending in the literal U+2026 character so it lands in `buildScoringPrompt`'s cut off branch and its "first 500 characters" claim is actually true of this fixture, the same truncated shape spec 0015's Follow up observed producing this instability live. Add `validateGroundTruth()`'s `stability-probe-not-truncated` check and its deliberately broken inline fixture (a `stability-probe` tagged pair ending in three ASCII periods instead of U+2026, proving the check actually distinguishes the two). Write the rationale field naming the 2026-09-06 observation rather than asserting a single confident band. Satisfies **AC-5**.
9. Extend `ground-truth.test.ts` to assert the full coverage invariants (every band present across the set, both required tags present, no duplicate id, every `archetypeId` resolvable, every `acceptableBands` valid) against the complete fifteen pair set. Satisfies the rest of **AC-8**.

**The archetypes** (concrete enough to author directly; fictional employer names are suggestions, not requirements):

| id | Career shape | Years | Key skills | Suggested fictional employers |
|---|---|---|---|---|
| `direct-fit-control` | Backend and AI engineer, the control group for every other archetype | 3 | Python, AWS, PostgreSQL, Docker, REST API design, data pipelines, Airflow, basic Kubernetes exposure | Lattice Cove Systems, Briarstone Analytics |
| `severe-experience-gap` | Very early career, real but shallow skill overlap, no ownership history | 0 to 1 | Python, Git, basic AWS (EC2, S3), SQL basics | Cedarline Devices |
| `right-level-wrong-domain` | Same years as the control, entirely different domain | 4 | SQL, Tableau, A/B testing, product analytics, Figma, user research | Hollowmere Retail, Fennimore Group |
| `adjacent-insufficient-depth` | Frontend and UI engineer, general software literacy, no backend systems depth | 3 | React, TypeScript, CSS, accessibility, component design, basic Node.js scripting, Git | Millhaven Studio, Aldergate Interactive |

`direct-fit-control`'s `preferences`: `desired_titles: ["Backend Engineer", "AI Engineer", "Software Engineer"]`, `desired_locations: ["Atlanta, GA", "Remote"]`, `remote_preference: "remote"`, `minimum_pay: 120000`, `minimum_pay_currency: "USD"`. The other three archetypes leave `preferences` undefined, matching the profile feature's own "not set yet" state.

**The fifteen pairs**:

| id | Archetype | Posting brief | `expectedBand` | `acceptableBands` | Tags | Why |
|---|---|---|---|---|---|---|
| `control-direct-match` | direct fit control | Backend Engineer, Python and AWS and data pipelines, 2 to 4 years, Atlanta or remote | strong_match | | control | Skills and work history cover essentially everything asked for, no real stretch. |
| `control-one-gap` | direct fit control | Same core stack, additionally requires real Kubernetes depth | good_match | | control | Covers most of the posting; Kubernetes depth is the one genuine stretch. |
| `control-unrelated-field` | direct fit control | Mechanical Engineer, CAD and thermal systems, no software at all | not_a_match | | control | Zero overlap in skills or work history. |
| `preference-match` | direct fit control | Same requirements as `control-direct-match`; description states remote, based anywhere, pay $130,000 to $150,000; location Remote | strong_match | | preference-isolation | Baseline: same skill match as the direct match pair, and the posting also happens to match the archetype's stated preferences. |
| `preference-violation` | direct fit control | Identical skill and experience requirements to `preference-match`; description instead states on site five days a week in Chicago, pay $95,000; location Chicago, IL | strong_match | | preference-isolation | Same skills and experience as the baseline pair; only the posting's location, on site language, and pay now conflict with the archetype's stated preferences on every one of the three fields those preferences name. The band must not move; if it does, preferences are leaking into it. |
| `stability-probe-generic` | direct fit control | Generic corporate boilerplate written to fill nearly the full 500 character Adzuna ceiling (mission statement, culture language, "join our growing team" elaborated at length) with no concrete skill, technology, or seniority requirement anywhere in it, cut off mid sentence and ending in the literal U+2026 character | possible_match | strong_match, possible_match | stability-probe | Spec 0015's Follow up already observed this exact excerpt shape, a real 500 character truncated excerpt naming no concrete requirement, scoring `strong_match` three times and `possible_match` six times in one live render on 2026-09-06. Written near the length ceiling rather than a short snippet with a decorative ellipsis, so `buildScoringPrompt`'s own "first 500 characters" claim is actually true here, faithfully reproducing the observed condition rather than a shorter, easier one. This is not a confident single answer; it exists to let feature 16 watch how much this input pattern moves across repeated runs. |
| `boundary-seniority-gap` | severe experience gap | Staff Backend Engineer, 8+ years, deep systems ownership and leadership required, Python listed among the stack | not_a_match | weak_match, not_a_match | boundary | The one named skill overlaps, but almost none of the required work history does, and `BAND_ANCHORS` states no separate seniority ceiling to resolve how that should weigh. A genuine reading of ambiguous text, not a settled fact; flagged for spec 0015. |
| `control-right-level` | severe experience gap | Junior Python Developer, 0 to 1 years, basic cloud exposure welcome | strong_match | | control | Matches the archetype's real, if limited, skills and level exactly. |
| `mild-stretch-possible-match` | severe experience gap | Backend Developer, 2 to 4 years, Python and AWS, some independent ownership expected | possible_match | | control | A real, modest step above the archetype's actual level; `possible_match`'s own anchor names exactly this shape with no ambiguity, unlike `boundary-seniority-gap` above, which is why this pair carries no `acceptableBands` and the plain `control` tag rather than `boundary`. |
| `control-domain-match` | right level wrong domain | Senior Data Analyst, SQL and Tableau and stakeholder reporting, 3 to 5 years | strong_match | | control | Matches the archetype's real domain and level exactly. |
| `key-domain-mismatch` | right level wrong domain | Backend or AI Engineer, Python, distributed systems, ML pipelines, 3 to 5 years | not_a_match | | control | Same experience band as the archetype's real level, so a low band here can only come from skills, not seniority. Nothing in the archetype's real skills or work history transfers. |
| `good-match-adjacent` | right level wrong domain | Senior Data Analyst role also requiring a SQL certification and one specific BI tool the archetype has not used | good_match | | control | Covers the great majority of the role; the certification and the unfamiliar tool are the one real, nameable stretch. |
| `possible-adjacent-domain` | right level wrong domain | Data Engineer, SQL and data pipeline maintenance, some analytics reporting, 3 to 5 years | possible_match | | control | Adjacent domain with real but partial overlap; applying would mean arguing the analyst experience transfers, not pointing at direct experience of it. |
| `weak-match-shallow-overlap` | adjacent insufficient depth | Backend Engineer, distributed systems, Kafka, large scale service architecture, 3 to 5 years | weak_match | | control | Only a small part carries over (general software literacy, basic Node scripting); the bulk of what is asked for sits entirely outside the archetype's real work history. |
| `control-frontend-match` | adjacent insufficient depth | Frontend Engineer, React and TypeScript and accessibility, 2 to 4 years | strong_match | | control | Matches the archetype's real domain and level. |

## Consequences

**Positive**:
- Spec 0015's `AC-2` (do the five bands actually spread real listings, deferred explicitly to this feature) finally has real evidence to run against once feature 16 exists.
- No expected band in this set encodes a rule the rubric never wrote. Where the rubric's wording genuinely cannot decide alone, the data says so plainly (`acceptableBands`, the `boundary` tag) instead of quietly asserting an answer.
- The preference isolation pair gives feature 16 a real, structural way to catch a preference leaking into the band, closing a gap spec 0015 itself named as untestable in its own build (`rubric.ts`'s own comment: "nothing in the schema stops the model from letting a preference mismatch influence the band anyway").
- No real personal data or real employer name reaches OpenAI through this set, in a repository anyone can read.

**Negative / tradeoffs**:
- The severe seniority gap pair still has no single confident expected band; `acceptableBands` makes that honest, but it does not resolve it. The rubric ambiguity survives this spec and is handed to spec 0015 as a Follow up, not fixed here.
- `stability-probe-generic`'s "pass" is not the ordinary one band match; feature 16's own build has to decide what to do with a pair like it (measure variance across reruns, most likely) rather than treating it as an ordinary accuracy check. This spec deliberately leaves that decision to feature 16, since it is about harness behavior, not ground truth data.
- Fifteen pairs across four archetypes is real, deliberate authoring work, not a small set; it was sized so every band is covered by at least one single, confident `expectedBand` pair, with more than one archetype touching most bands. `weak_match`'s second example is the `boundary-seniority-gap` pair's widened tolerance rather than a second exact match, which is honest given that pair's own stated ambiguity, not a coverage shortcut.
- `ai_scoring` leaves `temperature` unset (`tiers.ts:120`), because the OpenAI API rejects `temperature: 0` at this reasoning effort; the provider's own default then applies, which is not guaranteed deterministic. Even an exact `expectedBand` pair can therefore flip to an adjacent band on any single run for reasons that are not a regression. This spec's data does not solve that; it only flags it (Follow up) for feature 16 to decide how many reruns settle a real mismatch.

**Neutral**:
- If the deferred "fetch the full posting" feature (`docs/scope/scope.md`, Deferred) ever ships, `buildScoringPrompt` would stop reading only a 500 character excerpt, and this set's `descriptionSnippet` values would stop matching what the model actually sees. That is not a mechanical rename: a full posting can resolve today's honestly labeled uncertainty (`notMentionedSkills`) into a confirmed gap and could shift some expected bands, the boundary pair most of all. This set should not be silently reused as "the full posting" if that ships; it needs its own deliberate re authoring pass.

## Follow-up

- [ ] Spec 0015's `BAND_ANCHORS` names a seniority expectation only inside `strong_match` and states nothing about how a severe experience or seniority shortfall elsewhere should weigh against a genuinely overlapping named skill. The `boundary-seniority-gap` pair surfaced this as a real gap, not a hypothetical one; consider revising the anchors to state it explicitly, per spec 0015's own Follow up direction to revise anchors from evidence rather than from this session's guess.
- [ ] Feature 16 (eval harness runner, not yet designed) needs to decide, as part of its own spec: how many times each pair reruns before a mismatch counts as a real regression rather than ordinary model noise, since `ai_scoring` leaves `temperature` unset and the provider's own default is not guaranteed deterministic (an earlier working note suggested 3 to 5 reruns per pair as a starting point); what counts as a pass for a `stability-probe` tagged pair (band variance across reruns, not a single match); and what each value in `tags` and the presence of `acceptableBands` should mean to its own pass or fail logic. This spec defines the data shape only, not the harness's interpretation of it.
- [ ] If feature 16's harness later shows `possible_match` pairs clustering toward the optimistic side of that band rather than reading as a genuine coin flip, that is a question about `BAND_ANCHORS`'s wording for spec 0015 to take up, not a question about this ground truth data.
- [ ] `BAND_ANCHORS`'s own comment (`rubric.ts:63-67`) states its wording "is expected to change". Every `expectedBand` and `rationale` in this set is derived from today's wording. Feature 16's own harness spec should decide how to detect when the anchors it checks against have drifted since this data was authored (a test pinning a snapshot of `BAND_ANCHORS`, failing with a message naming this dataset, is one concrete way), rather than silently scoring tomorrow's rubric against yesterday's expectations.
- [ ] `BAND_ANCHORS` says nothing about a degree or a certification requirement, the same class of silence this spec surfaced for a severe seniority shortfall. `good-match-adjacent` touches this at the pair level (a missing certification is its one named stretch), but no archetype isolates it the way `severe-experience-gap` isolates the seniority question, so a strong skills, no formal credential profile against a posting that states a degree or certification requirement is undefined in the same way the seniority shortfall was before `boundary-seniority-gap` named it. AC-1's "at least four" does not require a fifth archetype now; this is recorded as a known gap rather than an oversight, for whoever next extends this set.
