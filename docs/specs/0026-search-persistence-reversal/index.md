# 0026. Reverse the search persistence rule for ATS listings

**Date**: 2026-10-19
**Status**: In Progress

Scope feature 40 ([docs/scope/scope.md](../../scope/scope.md), "40. Reverse the search persistence rule", the first row of v2). Mode: ENHANCEMENT, decision only. This spec adds no table, no route and no code. It changes documents only.

## Summary

JobHunt used to say that search results never persist. That stops being true for listings that come from company job boards (Greenhouse, Lever, Ashby), because those boards have no search: the only way to use them is to copy a whole board into our database and filter the copy. This spec ratifies that reversal and keeps it narrow. Company board listings are stored and shared between users. Adzuna results are still a live call and are still never stored by search. A score is still worked out fresh for each reader, because it depends on that reader's profile. The spec names what the reversal costs (tracking when a job was last seen, when it closed, and when a fetch failed), lists every accepted spec that repeats the old rule, gives the exact note each one gets, and hands the open questions to the features that own them.

## Requirements

**User stories**:
- As the engineer, I want the reversal decided once and recorded where later specs will find it, so that the ATS features (41 to 52) do not each re argue it.
- As a later spec author, I want to know which accepted specs still say "never persisted" and whether they are wrong now, so that I do not inherit a false claim.
- As a reader of spec 0013, I want its pointer to the persistence rule to lead somewhere true.

**Acceptance criteria**. Each holds one claim. AC-1 to AC-18 are met by this spec's own text and are checked by reading it. AC-19 to AC-27 are checked against the other files named.

- **AC-1**: This spec states that listings from company job boards are ingested, stored, and shared across users.
- **AC-2**: This spec states that Adzuna results fetched by the search path are never stored.
- **AC-3**: This spec names the `application` snapshot (spec 0003) as an existing place Adzuna data is stored, and says this reversal does not change it.
- **AC-4**: This spec names `demo_result` (spec 0021) as an existing place Adzuna listings are stored, written by the demo refresh and not by search.
- **AC-5**: This spec names `demo_result` as an exception to spec 0015's rule that a score is never persisted, naming the stored fields (`band`, `matched_skills`, `not_mentioned_skills`, `reasoning`).
- **AC-6**: This spec names `demo_result` as an exception to spec 0019's rule that a check outcome is computed in memory for one render, naming the stored field (`ungrounded_skills`).
- **AC-7**: This spec states that a score for a stored ATS row is computed per render for the caller's own profile and is never persisted.
- **AC-8**: This spec states that caching work derived from the posting alone, never from any user's data, and stored once per posting at ingest, is not ruled out, and leaves it to its own spec (feature 14 v2, deferred).
- **AC-9**: This spec states that no per user seen jobs ledger is created, and that jobs merely seen but not acted on stay undeduplicated per user.
- **AC-10**: This spec names `first_seen_at`, `last_seen_at`, closed status, failed polls and the mass close guard as the staleness cost taken on deliberately.
- **AC-11**: This spec states that stored ATS rows and Adzuna rows share one in memory read contract carrying a `source` field, with separate storage.
- **AC-12**: This spec states that the read contract must tell a full text row from an excerpt row.
- **AC-13**: This spec states that feature 45 owns the read contract, in `src/lib`, and that feature 42 owns the storage columns only.
- **AC-14**: This spec states that feature 45 owns widening the apply path (`application.source`'s check constraint and `listingSnapshotSchema`) to match the `source` vocabulary feature 42 settles.
- **AC-15**: This spec does not decide the `source` values, which belong to feature 42's stored job shape, and records a per platform lean marked as inferred.
- **AC-16**: This spec does not decide how long closed jobs are kept, and records that feature 42's spec owns it.
- **AC-17**: This spec does not decide what an application points at once its listing closes, and records that feature 42's spec owns it, together with the guarantee spec 0003 already gives.
- **AC-18**: This spec states that a discard (feature 22) is an acted on record and not a seen jobs ledger, that this reversal does not touch it, and that its storage belongs to feature 22.
- **AC-19**: The audit in `rationale.md` lists every accepted spec place found to restate the old rule, and marks each one amended or left unchanged with its reason.
- **AC-20**: Every row of the audit's Amended table has its note in the named file at the quoted text, with the wording given under "Amendment text" below.
- **AC-21**: Each note is dated, sits inline straight after the sentence it qualifies, and names spec 0026.
- **AC-22**: No amended sentence is rewritten. The one exception is spec 0013's two stale claims, which are struck through (not deleted) and followed by a dated correction note.
- **AC-23**: Spec 0013 no longer presents "Slice 1 introduction" as where the rule is recorded.
- **AC-24**: Spec 0013 no longer presents feature 12 as importing the `Listing` shape.
- **AC-25**: The standing rule in `docs/scope/scope.md` names this spec as where the boundary and cost are recorded, and no longer says the reversal is only the engineer's direction.
- **AC-26**: The notes on features 4, 11 and 12 in `docs/scope/scope.md` do not claim Adzuna data is never stored without naming the two exceptions.
- **AC-27**: Feature 40's own row note in `docs/scope/scope.md` no longer says the reversal is not yet a ratified decision, once this spec is `Accepted`.

## Decision

**Chosen option**: Option 1, reverse the rule for ATS sourced listings only, with the boundary and the cost written down. (Options in [rationale.md](rationale.md).)

**Implementation skills**: none. This spec changes documents, not code.

### The rule as it now reads

This is the wording later specs should quote.

> The search path never stores Adzuna results. Listings from company job boards (ATS sourced) are ingested and stored, readable by every signed in user, and the staleness tracking that needs is accepted on purpose. Outside search, an application keeps its own snapshot of the listing (spec 0003). A fit score or check outcome for a real search is never stored: it is worked out per render for the caller's own profile, for either source. The one exception to that is the public demo's `demo_result` table, written by the demo refresh against two made up personas (spec 0021).

### Boundary table

| Data | Stored? | Where | Readable by | Written by |
|---|---|---|---|---|
| ATS listing (Greenhouse, Lever, Ashby) | Yes | a job table, designed by feature 42 | every signed in user, read only | the ingest route (feature 43), never a user |
| Adzuna search result | No | memory, one render | not applicable | not written |
| Application snapshot of a listing (either source) | Yes | `application` (spec 0003), at the moment a user applies | its own user only | `recordApplication` (spec 0014) |
| Demo listings and scores, including check outcomes | Yes | `demo_result` (spec 0021) | every visitor, on `/demo` | the demo refresh, not search |
| Fit score or check outcome for a real search | No | memory, one render | not applicable | not written |
| A discard (feature 22, v3) | not decided here | feature 22 | not decided here | not decided here |

### Decisions

1. **Scores stay per render, for both sources.** A score depends on the caller's profile, so a shared stored row cannot carry one (AC-7). Storing a score per user and job would also create the seen jobs ledger the scope rejected (AC-9). Spec 0015's rule is unchanged for real searches. Work derived from the posting alone, never from any user's data, and stored once per posting at ingest, is a different thing from a score and is not ruled out. It belongs to its own spec (AC-8).
2. **One read contract, separate storage.** Both sources map into one in memory listing shape with a `source` field, at the boundary that cards, scoring and apply read. The stored ATS table is its own, and Adzuna stays unstored (AC-11). The contract must tell a full text row from an excerpt row, because feature 51's source aware score card depends on that (AC-12). **Feature 45 owns the contract, in `src/lib`** (it is the first feature to render an ATS row, and two features share it). **Feature 42 owns the storage columns only** (AC-13).
3. **Feature 45 widens the apply path.** `application.source` carries `check (source in ('adzuna'))` and `listingSnapshotSchema` accepts only the Adzuna literal. The first ATS card with an apply control is in feature 45's slice, so 45 widens both, in an ordinary migration, to match whatever vocabulary feature 42 settles (AC-14).
4. **The `source` values are not decided here.** Feature 42's row owns the stored job shape, which includes `source`. The lean is one value per platform (`greenhouse`, `lever`, `ashby`), because a job id is only unique within one board system and the unique key `(source, source_job_id)` is stronger when `source` says which one. That reasoning is **inferred**, not verified against the real responses, which feature 41's spike will show (AC-15).
5. **Adzuna's half of the rule is worded precisely.** "Search never stores Adzuna results" is true. "Adzuna is never stored" was never fully true, because the `application` snapshot and `demo_result` hold Adzuna data. Both are named (AC-3, AC-4).
6. **`demo_result` is also an exception to two score rules.** It stores a band, matched and not mentioned skills, reasoning and ungrounded skills against two made up personas (AC-5, AC-6). Naming it is safe because those rows are not any real user's.
7. **Retention and the application link are not decided here.** Row 40's "Done when" does not include them, and the scope note under feature 42 lists them as open for that spec (AC-16, AC-17).
8. **A discard is not a seen jobs ledger.** The struck standing rule said "Only an applied record, and later a discard, makes a job stick". A discard is a per user record of a job the user acted on, so it stays outside this spec. Its storage, including whether it can point at the stored job table, belongs to feature 22 (AC-18).
9. **Accepted specs get dated inline notes, not rewrites.** The audit in `rationale.md` decides which, and "Amendment text" below gives the words (AC-19 to AC-22). Spec 0013's two stale claims are struck through and corrected (AC-23, AC-24).

### Value sourcing

Not applicable: this spec adds no action, route or read path. The one value other specs will quote, the rule wording, has one source, the "The rule as it now reads" block above.

### Amendment text

**Note format.** `**Note, 2026-10-19 (spec 0026):** <text>` placed inline, directly after the sentence it qualifies. A later reader should see the old wording and the note together.

| File and place (quote to find it) | Literal note |
|---|---|
| 0003 `index.md`, "Search results still do not persist, so an application carries a full copy of the listing it was made against." | "This holds for Adzuna results. From v2, listings from company job boards are stored too, and an application still carries its own full copy, because it must not depend on what later happens to a stored row." |
| 0003 `index.md`, heading "`application` (the only place a job persists)" | "From v2 a job board listing is also stored, in a shared job table. This table stays the only place a job is kept for one user, which is what this heading means." |
| 0003 `rationale.md`, "**Search results do not persist, by an earlier decision.** That removes a staleness state machine entirely" (the first sentence is bold in the file) | "Reversed for job board listings, which are stored and shared, with the staleness cost taken on deliberately. It still holds for Adzuna results. The reason for the snapshot stands for both sources." |
| 0008 `rationale.md`, "no saved results (feature 11's results are fresh per search), and the application record is the only place a job persists" | "This describes v1. From v2, job board listings are stored, though still not saved per user." |
| 0014 `index.md`, Consequences, "The application record becomes the only place a job persists" | "True of Adzuna jobs. Job board listings stored from v2 persist in their own table, and the application record still keeps its own copy." |
| 0014 `rationale.md`, Context, "makes the application record the only place a job persists" | "True of Adzuna jobs when this was written. See spec 0026 for job board listings." |
| 0015 `index.md`, Data model sketch, "A score is never persisted" | "This holds for real searches on either source, including a stored job board listing, because a score depends on the caller's profile. The one exception is `demo_result`, which stores scores against two made up personas (spec 0021)." |
| 0015 `index.md`, Key invariants, "matching `job_search`'s own existing non caching behavior (spec 0013)" | "That reason describes the Adzuna call. For a stored job board listing the reason is different: a score depends on the profile, so a shared row cannot carry it." |
| 0015 `index.md`, Consequences, "Scores are never cached ... the same non caching precedent `job_search` itself already accepts" | "Same as the note on the Key invariants bullet. Work derived from a posting alone and stored once at ingest is not a score and is not ruled out (spec 0026)." |
| 0019 `index.md`, State transitions, "The check is stateless per render" | "True for real searches. The one exception is `demo_result.ungrounded_skills`, which stores a check outcome for the public demo (spec 0021)." |
| 0013 `index.md`, Data model sketch, the two struck claims below | Strike through `(by product decision, recorded in docs/scope/scope.md's Slice 1 introduction)` and `Feature 12 imports this exact shape later for its own field mapping (spec 0003 already names feature 11 as owner of that mapping).` Then add: "**Correction, 2026-10-19 (spec 0026):** the rule is the standing rule 'Search results never persist' under 'Standing rules this scope was written under' in `docs/scope/scope.md`, now scoped to Adzuna results by spec 0026. The Slice 1 introduction does not mention it. Feature 12 did not import this shape: it declared its own `listingSnapshotSchema` in `src/features/applications/schemas.ts`." |

**Scope edits** (`docs/scope/scope.md`):
- Standing rule: replace "Until feature 40's spec exists this is the engineer's direction, not a ratified decision." with "The boundary and the cost accepted are decided in spec [0026](../specs/0026-search-persistence-reversal/index.md)."
- Feature 4 note: replace "Adzuna results still are not." with "Adzuna search results still are not stored (the application snapshot and the public demo are the two places Adzuna data is kept, spec 0026)."
- Feature 12 note: replace "Of Adzuna jobs that remains true;" with "Of Adzuna search results that remains true, the public demo's stored results aside (spec 0026);".
- Feature 11 note: no wording change needed, since it says "Still true of Adzuna results" and does not claim Adzuna is never stored. It is checked, not edited.
- Feature 40 row note ("Until this row's spec exists, the reversal is the engineer's direction ... not an accepted decision"): reword after this spec is `Accepted`, at feature close, to say the reversal is ratified by spec 0026.
- The At a glance row for feature 40: moved by `/architect` at spec capture and by `/develop` at close, as for any feature.

## Build plan

Documents only. `/develop` applies these in order. AC-1 to AC-18 need no step, because this spec's own text meets them.

1. [x] Add the three notes to spec 0003 (`index.md` twice, `rationale.md` once) from "Amendment text". Satisfies **AC-20**, **AC-21**, **AC-22**.
2. [x] Add the note to spec 0008 `rationale.md`. Satisfies **AC-20**, **AC-21**, **AC-22**.
3. [x] In spec 0013 `index.md`, strike through the two stale claims and add the correction note. Satisfies **AC-20**, **AC-21**, **AC-22**, **AC-23**, **AC-24**.
4. [x] Add the two notes to spec 0014 (`index.md` Consequences, `rationale.md` Context). Satisfies **AC-20**, **AC-21**, **AC-22**.
5. [x] Add the three notes to spec 0015 `index.md`. Satisfies **AC-20**, **AC-21**, **AC-22**.
6. [x] Add the note to spec 0019 `index.md`. Satisfies **AC-20**, **AC-21**, **AC-22**.
7. [x] Apply the scope edits listed under "Scope edits", except feature 40's row note and status, which wait for this spec to be `Accepted`. Satisfies **AC-25**, **AC-26**.
8. [x] Repeat the persistence search over `docs/specs`, `src/` and `supabase/migrations` using the audit's term list plus `cached`, `ephemeral` and `no cache`. Add every new hit to the audit, then amend or justify it, and repeat until a pass finds nothing new. Satisfies **AC-19**.
9. [ ] At feature close, set this spec's Status to `Accepted`, then reword feature 40's row note. Satisfies **AC-27**.

## Consequences

**Positive**:
- The reversal is decided once, with its boundary, before any ATS feature is designed, so the specs for features 41 to 52 can cite one place.
- Adzuna stays a live call, so retiring it later removes one mapper and nothing stored.
- Spec 0013's two stale claims are corrected, and the audit shows which other places were checked and why they stand.

**Negative / tradeoffs**:
- The project takes on a staleness state machine it avoided until now: when a job was first and last seen, closed status, failed polls and a mass close guard (AC-10). It needs an alert from day one (feature 43), because a failed poll changes nothing by design.
- Scoring per render means every search over stored ATS rows pays for scoring again. Full text raises the token cost per score, and the usage gate and spend visibility must still hold. Feature 51 sizes that, and this spec does not fix it.
- Two read paths (a stored table and a live call) feed one contract until Adzuna is retired.

**Neutral**:
- The privacy notice does not say search results are not stored (verified by search of `src/features/legal`), so the reversal needs no change there. Whether the job table needs a sentence is feature 42's question.

## Follow-up

- [ ] **Hand off to feature 42's spec** (not edited into row 42 here): decide retention of closed jobs and whether an application keeps a link to a job that has closed (AC-16, AC-17); decide the stored job shape including the `source` vocabulary, starting from the per platform lean in Decision 4. Constraints it starts from:
  - `application` stores a full snapshot and has no foreign key to any job, so an application already survives its listing closing or being deleted. Adding a link from `application` to the stored job would be a new decision made with that guarantee in view.
  - Production runs on Supabase's free plan (`docs/observability/README.md` line 98). Size the job store from feature 41's measured board sizes and description lengths, and set closed job retention so storage growth stays bounded.
  - Row level security enabled and forced in the same migration, stored ATS rows readable by signed in users and not writable by them (feature 42's own Done when).
  - The privacy notice's drift guard (`src/features/legal/stored-fields.test.ts`, spec 0009) reads `src/lib/supabase/database.types.ts` and fails for a `public` table that is in neither of its two lists, once `pnpm db:types` has been rerun. A job table and a registry are likely non personal data, but descriptions can name recruiters, so 42 decides, with the reason.
  - A migration must not land in the same window as feature 35's `work_experience` migration (scope row 42's scheduling note).
- [ ] **Hand off to feature 45's spec** (not edited into row 45 here): own the one read contract in `src/lib`, including how it tells a full text row from an excerpt row; and widen `application.source`'s check constraint and `listingSnapshotSchema` to the vocabulary feature 42 settles (AC-13, AC-14).
- [ ] Feature 51's spec sizes the token cost of scoring full text rows per render and decides what the source aware score card shows. It reads the contract from feature 45.
- [ ] Feature 43 registers its ingest span first, in `docs/observability/spans.md`, per the standing rule.
- [ ] When a posting only extraction is designed (feature 14 v2, deferred), it cites Decision 1 as the reason it is allowed.
- [ ] Feature 22's spec decides where a discard is stored (Decision 8).
- [ ] `/sync` runs on this branch before the merge, not after (2026-10-17 reflex).

## Rationale

Reasoning, options and the audit of accepted specs: see [rationale.md](rationale.md).
