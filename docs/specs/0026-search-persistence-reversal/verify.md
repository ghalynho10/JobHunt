# Verify: reverse the search persistence rule · spec 0026 · updated 2026-10-19
_Steps derived from spec 0026 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. This feature changes documents only, so every step is a read or a search, not a run of the app._

## Reading the spec itself (AC-1 to AC-18)
- [ ] Read "The rule as it now reads" and the Boundary table in `index.md` → job board listings are ingested, stored, and readable by every signed in user → AC-1
- [ ] Same place → Adzuna results fetched by search are never stored → AC-2
- [ ] Boundary table and Decision 5 → the `application` snapshot (spec 0003) is named as an existing Adzuna store, unchanged by this spec → AC-3
- [ ] Boundary table and Decision 5 → `demo_result` (spec 0021) is named, written by the demo refresh, not by search → AC-4
- [ ] Decision 6 and the 0015 amendment row → `demo_result` is an exception to spec 0015, naming `band`, `matched_skills`, `not_mentioned_skills`, `reasoning` → AC-5
- [ ] Decision 6 and the 0019 amendment row → `demo_result` is an exception to spec 0019, naming `ungrounded_skills` → AC-6
- [ ] Decision 1 → a score for a stored job board row is worked out per render for the caller's own profile, never stored → AC-7
- [ ] Decision 1 → posting only derived work stored once at ingest is not ruled out, and is left to its own spec (feature 14 v2) → AC-8
- [ ] Decision 1 → no per user seen jobs ledger; jobs merely seen stay undeduplicated per user → AC-9
- [ ] Consequences, Negative → `first_seen_at`, `last_seen_at`, closed status, failed polls and the mass close guard are named as the cost → AC-10
- [ ] Decision 2 → one in memory read contract with a `source` field, separate storage → AC-11
- [ ] Decision 2 → the contract must tell a full text row from an excerpt row → AC-12
- [ ] Decision 2 → feature 45 owns the contract in `src/lib`; feature 42 owns only the storage columns → AC-13
- [ ] Decision 3 → feature 45 widens `application.source`'s check constraint and `listingSnapshotSchema` → AC-14
- [ ] Decision 4 → the `source` values are left to feature 42, with the per platform lean marked inferred → AC-15
- [ ] Decision 7 → retention of closed jobs is left to feature 42 → AC-16
- [ ] Decision 7 and Follow up → what an application points at once its listing closes is left to feature 42, with spec 0003's no foreign key guarantee stated → AC-17
- [ ] Decision 8 → a discard is an acted on record, untouched here, its storage belongs to feature 22 → AC-18

## Commands and reads against other files (AC-19 to AC-27)
- [ ] Run a case insensitive search of `docs/specs/**/*.md` (excluding spec 0026 and every `verify.md`) for `persist|stateless|only place|per render|every render|recompute|never stored|not stored|never saved|not saved|not retained|never retained|cached|ephemeral|no cache` → every hit is either in `rationale.md`'s Amended table, its Checked and left unchanged table, or is one of the dated notes this spec added. Make the check move on purpose first (remove one row from a scratch copy of the audit and confirm that hit is reported) → AC-19
- [ ] For each Amended row, open the named file at the quoted text → the literal note from "Amendment text" is there, word for word → AC-20
- [ ] Same notes → each starts `**Note, 2026-10-19 (spec 0026):**` (or `**Correction, ...**` for 0013), sits on the same line or paragraph straight after the sentence it qualifies, and names spec 0026. The 0003 `application` label is the one place the note sits in its own paragraph after the label, since a note on a table label line would break it → AC-21
- [ ] `git diff 771495b -- docs/specs ':!docs/specs/0026-search-persistence-reversal'` with `--word-diff` → the only removed words are spec 0013's two claims turning into `~~...~~` strikethrough; no other sentence is reworded → AC-22
- [ ] Read spec 0013 `index.md` Data model sketch → "Slice 1 introduction" appears only inside strikethrough, followed by the correction pointing at the standing rule → AC-23
- [ ] Same place → "Feature 12 imports this exact shape" appears only inside strikethrough, and the correction names `listingSnapshotSchema` in `src/features/applications/schemas.ts` (confirm that export exists) → AC-24
- [ ] Read the standing rule under "Standing rules this scope was written under" in `docs/scope/scope.md` → it links spec 0026 and no longer says "the engineer's direction, not a ratified decision" → AC-25
- [ ] Read the notes on features 4, 11 and 12 in `docs/scope/scope.md` → none claims Adzuna data is never stored without naming the application snapshot and the public demo (feature 11 says "Still true of Adzuna results" and is unchanged by design) → AC-26
- [ ] After spec 0026 is `Accepted` at feature close → feature 40's row note no longer says the reversal is not yet ratified → AC-27

## Acceptance-criteria coverage
- AC-1 to AC-18 · one reading step each, above
- AC-19 · the search step · AC-20 · the note by note read · AC-21 · the note format read · AC-22 · the word diff · AC-23, AC-24 · the spec 0013 reads · AC-25, AC-26 · the scope reads · AC-27 · the close out read, pending until the spec is `Accepted`
