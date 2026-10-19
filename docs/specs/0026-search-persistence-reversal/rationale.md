# Rationale: reverse the search persistence rule for ATS listings · spec 0026

Each claim below is marked **verified** (with the file read) or **inferred**.

## Context

Since the scope was written, one standing rule said search results never persist. Its stated reason was to avoid a staleness state machine. The scope's preamble told `/architect` and `/develop` to inherit its standing rules without re reading them, so specs 0003, 0008, 0013, 0014, 0015 and 0019 each restated the rule or a consequence of it in their own words (the audit below lists every place). (verified: `docs/scope/scope.md`, "Standing rules this scope was written under", and the spec lines in the audit below)

Feature 40 reverses it for ATS sourced listings. Greenhouse, Lever and Ashby publish a whole company board per call and offer no search, so using them means copying a board into our database and filtering the copy. (verified: the v2 introduction in `docs/scope/scope.md`. The endpoint behaviour itself comes from the ATS brief, `docs/archive/jobhunt-ats.md`, which is kept locally and not committed, listed in `.git/info/exclude` on purpose. Its endpoint details "came from memory" by its own admission, and feature 41's spike verifies them. This spec relies on the brief only for the shape of the problem, which the scope carries, so no reader needs the file.)

The reversal is the engineer's direction, recorded in the scope on 2026-10-16. This spec ratifies it and works out what follows. It does not reopen whether to reverse.

If this were not decided first, every ATS spec (41 to 52) would either quote a rule the scope has struck, or each re argue the boundary. A third outcome is worse: specs 0003, 0013, 0014 and 0015 would go on telling readers that nothing is stored.

## Options considered

### Option 1: Reverse for ATS only, with the boundary and the cost written down (chosen)

ATS listings are stored and shared. Adzuna search stays live and unstored. Scores stay per render. The staleness cost is named.

**Pros**:
- Matches the shape of the source: boards cannot be searched, Adzuna can.
- Keeps Adzuna removable later: nothing stored depends on it.
- Ingestion cost is shared across users, so it does not grow with signups. (verified: the ATS brief states this as a constraint, and the scope carries it in feature 43's row. The scaling claim itself is inferred.)

**Cons**:
- Takes on the staleness state machine on purpose.
- Two read paths feed one contract until Adzuna is retired.

### Option 2: Reverse for everything, store Adzuna results too

One rule, one table shape, one read path.

**Pros**:
- No two sources to reconcile in storage.

**Cons**:
- Contradicts the recorded direction: Adzuna stays a live call. (verified: scope.md standing rule, struck line)
- Storing a third party's search results brings staleness for a source that does not need it, and could raise terms questions. (inferred: Adzuna's terms were not re read for this spec, and feature 11's attribution work is spec 0013 AC-6 and AC-7.)
- Makes retiring Adzuna a data migration, not a deletion.

### Option 3: Do not reverse, fetch company boards live on each search

Keep the old rule, call every enabled company board during a search and filter in memory.

**Pros**:
- No staleness state machine, no stored job table.

**Cons**:
- Each search would touch every enabled board (the registry is sized at 20 to 40 companies, scope row 42). That is tens of outbound calls per search, inside the page render. (inferred from the registry size, not measured)
- Cost scales with searches instead of with the registry.
- No closed posting detection, no `first_seen_at`, which the "new matches since your last visit" idea in the brief would need. (verified: the brief's "What this unlocks")

## Rationale

Option 1 is the only one that follows the recorded direction and keeps Adzuna removable. Option 3 avoids the cost the scope accepted, but moves the same work into every search request. A render is the wrong place for tens of outbound calls. Option 2 widens the reversal past what the sources need.

**Why scores stay per render.** A fit score depends on the caller's own profile (skills, work history, stated preferences). (verified: spec 0015, Data model sketch and Security model) A stored ATS row is shared by every user, so it cannot carry one. Storing a score per user and job would be a new table that grows with every search a user runs, which is the per user seen jobs ledger the scope already refuses (the refusal is verified in the scope.md standing rule, "Accepted trade off, unchanged"; that a score table would grow that way is **inferred**). The engineer also asked that this not rule out caching work that does not depend on the profile, done once per posting at ingest, which is what feature 14 v2 describes (deferred). That stays its own decision.

**Why one read contract and not one shape or two.** The card, the score and the apply control need the same fields from either source. A second path through each of them is code that exists only until Adzuna is retired. A shared stored shape would require storing Adzuna. A read contract with a `source` field gets the first without the second. The contract has to say whether the description is full text or an excerpt, because for full text rows a skill the posting does not mention is a confirmed gap, and for excerpts it is only unconfirmed (verified: the brief's slice 3 note, carried in feature 51). The fields are left to features 42 and 45 because they depend on what the spike (41) finds in the real responses.

**Why retention and the application link are left to feature 42.** Row 40's Done when does not list them, and the scope's note under feature 42 lists both as open for that spec. (verified: scope.md rows 40 and 42) Nothing in this reversal forces an answer first. Spec 0003 already makes an application carry a full snapshot of its listing, with no foreign key to any job, so the guarantee a user cares about holds whichever way 42 decides. (verified: `docs/specs/0003-data-model/index.md`, `application` table, and `supabase/migrations/20260825162457_data_model.sql`, where `source_job_id` is a plain text column under a `(profile_id, source, source_job_id)` unique key) The one thing that could change it is if 42 adds a foreign key from `application` to the stored job. This spec says that would be a new decision.

## Audit of accepted specs

**How the search ran.** A case insensitive search of every `*.md` under `docs/specs` for: persist, stateless, only place, per render, every render, recompute, never stored, not stored, never saved, not saved, not retained, never retained. Each match was read. Matches inside `verify.md` files are evidence for the spec beside them and are not counted as separate claims. A claim phrased in none of those words would be missed, so completeness is **inferred**, and AC-19's build step (build step 8) repeats the search after the edits. A review pass by a second model then added the terms `cached`, `ephemeral` and `no cache`, and searched the migrations, and found the rows marked "added by cross check" below. Outside the specs, `AGENTS.md`, the nested `AGENTS.md` files, `src/` comments, `docs/overview.md`, `docs/observability/` and `src/features/legal/` were searched for the same ideas. The only code hit was a comment, `src/lib/ai/tiers.ts:105`, "Scoring is stateless per render", which stays true. The two migration comments are in the left unchanged table.

Line numbers are as of 2026-10-19. Each row also gives the text, because lines move.

### Amended (a dated note, except where marked)

| Spec and place | What it says | Why it needs a note |
|---|---|---|
| 0003 `index.md:126`, the `application` heading | "the only place a job persists" | After the reversal an ATS listing persists in the job table as well. The snapshot is still the only place a job a user acted on is kept for that user. The note says so. |
| 0003 `rationale.md:15` | "**Search results do not persist, by an earlier decision.** That removes a staleness state machine entirely" (the first sentence is bold in the file) | The staleness machine is now taken on for ATS rows. The reason the snapshot exists (the listing may disappear) holds for ATS rows too, and holds harder. |
| 0003 `index.md:25` (added by cross check), the Summary | "Search results still do not persist, so an application carries a full copy of the listing it was made against." | The most direct restatement in 0003. Holds for Adzuna; the note adds job board listings and says the copy still stands. |
| 0008 `rationale.md:70`, the "scale by subtraction" paragraph | "no saved results (feature 11's results are fresh per search), and the application record is the only place a job persists" | Still true of v1's inventory, but it reads as a standing fact. The note dates it to v1. |
| 0013 `index.md:64`, Data model sketch | "Results are never persisted (by product decision, recorded in ... Slice 1 introduction) ... Feature 12 imports this exact shape later" | **Struck through and corrected**, with a dated correction note. See the next section. |
| 0014 `index.md:238`, Consequences | "The application record becomes the only place a job persists" | Same as 0003. |
| 0014 `rationale.md:5`, Context (added by cross check) | "...makes the application record the only place a job persists" (the same paragraph that says feature 11 "deliberately persists nothing") | The first half of that paragraph is a historical statement of what feature 11 did. The last sentence is the same claim as `index.md:238`, so it gets a note. |
| 0015 `index.md:66`, Data model sketch | "A score is never persisted" | Still true for real searches, either source. The note adds the one exception, `demo_result`, and says the rule covers stored ATS rows. |
| 0015 `index.md:187`, Consequences (added by cross check) | "Scores are never cached ... the same non caching precedent `job_search` itself already accepts" | Same reasoning as `:112`, so it needs the same note. |
| 0015 `index.md:112`, Key invariants | "recomputes every score, matching `job_search`'s own existing non caching behavior (spec 0013)" | `job_search`'s non caching behavior describes the Adzuna call. For a stored ATS row the reason is different (a score depends on the profile). The note says so. |
| 0019 `index.md:48`, State transitions | "The check is stateless per render" | Same exception as 0015: `demo_result.ungrounded_skills`. |

### Checked and left unchanged

| Spec and place | What it says | Why it stands |
|---|---|---|
| 0013 `index.md:116` | "Neither shape is persisted, so there is no lifecycle to define" | Refers to 0013's own two in memory shapes, which are Adzuna's. Still true. |
| 0013 `index.md:149`, Key invariant 6 (added by cross check) | "No listing data is ever written to the database by this feature. Every result is request scoped and re fetched on the next search." | Says "by this feature", and feature 11 only reads Adzuna. Still true. Spec 0022 cites it by number. |
| 0015 `rationale.md:59` (added by cross check) | "the ephemeral no cache scoring" | A design time description of the option space; the notes on `index.md` carry the correction. |
| `supabase/migrations/20260825162457_data_model.sql:165` and `:175` (added by cross check) | "-- application: the only place a job persists" and "-- Snapshots. Search results deliberately do not persist ..." | An applied migration is history and is not edited. The notes on spec 0003 cover them. |
| 0013 `index.md:11` and the AC list | Describes a live Adzuna call per search | Describes the Adzuna path. Still true. |
| 0015 `index.md:76`, `:123` | "Scoring is stateless per render" and the `store: false` retention paragraph | Both stay true: no score is stored, and the vendor retention opt out is unaffected by where a listing came from. |
| 0012 `index.md:42`, `:61` | The router is stateless; the only place the tier mapping exists is `tiers.ts` | About the router, not search results. |
| 0021 `index.md` and `rationale.md:93` | `demo_result` stores listings and scores; scoring "is computed live per search render, per spec 0015" | `demo_result` is the exception this spec names. Its rationale line is about real searches. Neither contradicts this spec. |
| 0022 `index.md:137` | "Neither a `Listing` nor the dedup grouping is persisted" | Both are Adzuna side, request scoped values. Merging ATS rows with Adzuna rows is feature 50's work, which will state its own state. |
| 0020 `index.md:21`, `:32`, `:111` | "on every render" | About a usage counter read, not search results. |
| 0008 `index.md:97`, `:237`; `rationale.md:151` | Cookie persistence; a stateless render path; a different "only place" | Unrelated to search results. |
| 0001, 0004, 0005, 0006, 0010, 0023, 0024 | Matches on "persist" or "only place" in other senses (a session cookie, an entry page that stores nothing, the secret key's one home, a profile editor) | Unrelated. |
| 0009 | No match | The privacy notice does not state that search results are not stored. |
| 0013 `index.md:206`, Consequences (added by build pass) | "this app keeps no cache of its own to serve a repeat view from" | About what a repeat view of an Adzuna search costs (AC-10). Adzuna stays a live, uncached call, so it is still true. How a search over stored job board rows is read is feature 45's to state. |
| 0002 `rationale.md:62`; 0005 `rationale.md:19`; 0008 `index.md:75`, `:231`; 0013 `index.md:28`, `:140`; 0014 `index.md:51`, `:146`, `:250`, `:264` and `rationale.md:108`; 0015 `index.md:203`; 0020 `index.md:49`, `:208` and `rationale.md:69`, `:117`; 0021 `index.md:484`, `:853` (added by build pass) | Matches in other senses: an ephemeral preview database, values "never stored formatted", session cookie persistence, vendor retention terms, a redirect that must not be cached, "Every rendered result" matching "every render", a promise that "needs no cache", a usage read per render, "persistently" | Unrelated to search results. |
| `src/app/(app)/search/page.tsx:195`, `:198` and `page.test.ts:253` (added by build pass) | One Adzuna call per render, and a shared promise that "needs no cache" | Code comments and a test name about the Adzuna path, which this spec leaves live. Still true. The build pass searched all of `src/` with the full term list; every other hit there is in another sense (cookies, render helpers, design system notes). |

### The two stale claims in spec 0013

Both are on `index.md:64`. Neither is carried into this spec.

1. **"recorded in `docs/scope/scope.md`'s Slice 1 introduction."** (verified) The only place `scope.md` mentions the rule outside the standing rule is the Slice 1 feature rows (for example the feature 11 row, which says results are fresh per search); no persistence text sits in a Slice 1 introduction. The standing rule is a bullet under "Standing rules this scope was written under", which is where the struck 'Search results never persist' bullet under 'Standing rules this scope was written under' (line 829 of `scope.md` on 2026-10-19) sits today. The correction points at that heading and at this spec, by heading text and not by line number, since lines move.
2. **"Feature 12 imports this exact shape later for its own field mapping."** (verified) Feature 12 did not. `src/features/applications/schemas.ts` declares its own `listingSnapshotSchema`, and its header comment gives the reason: `Listing` is the output of a transform, so nothing could parse it back, and "Parse at every boundary" needed a schema of its own. What was shared with feature 12 is constants and render helpers, all now in `src/lib` (`ADZUNA_SOURCE` in `src/lib/adzuna.ts`, moved on 2026-09-05 under spec 0014; the formatting helpers named below). The parenthetical inside that same sentence, "(spec 0003 already names feature 11 as owner of that mapping)", goes with the struck sentence. The different phrase "spec 0003's Value sourcing table names this feature as the one that sets it" is on `index.md:70` (the `Listing.source` row), is accurate, and is left alone. Feature 12 also took shared render helpers out of feature 11's area (`src/lib/listing-format.ts`, `src/lib/listing-normalize.ts`, commit `741bd67`, 2026-09-05), which is a reason `Listing` itself did not need to move.

## Cost accepted

The old rule bought one thing: no staleness state machine. These are the parts of it that now exist, and where each is decided.

| Part | What it is | Decided in |
|---|---|---|
| `first_seen_at`, `last_seen_at` | when a stored job first and last appeared on its board | feature 42 (columns), 43 (writes) |
| closed status | a job is closed only when a successful fetch of its board no longer contains it | features 42, 47 |
| failed polls | a failed fetch changes nothing and is recorded, so a failure never reads as an empty board | features 42, 43 |
| mass close guard | a fetch that would close a large share of a board, or take it to zero, closes nothing and flags the company | features 43, 47 |

(verified: the v2 introduction and the rows for 42, 43 and 47 in `scope.md`; the thresholds are open questions in the brief, owned by those features.)

## References

**Project sources** (in this repo unless marked):
- `docs/scope/scope.md`: the struck standing rule under "Standing rules this scope was written under"; the v2 introduction ("The first decision of v2"); feature rows 40, 42, 43, 47, 51; the notes on features 4, 11 and 12.
- ATS brief: `docs/archive/jobhunt-ats.md`. Kept locally and not committed, listed in `.git/info/exclude` on purpose. Wherever the scope carries the same point, the scope line is the citation above.
- Specs 0003, 0008, 0009, 0012, 0013, 0014, 0015, 0019, 0021, 0022 (the audit above).
- `src/features/applications/schemas.ts` (`listingSnapshotSchema`), `src/lib/adzuna.ts` (`ADZUNA_SOURCE`).
- `supabase/migrations/20260825162457_data_model.sql` (`application`), `20260913120000_demo_result.sql` (`demo_result`).
- `src/features/legal/stored-fields.test.ts` (the classification guard a new table must pass).
- Root `AGENTS.md`, "Rules" (RLS on every table, the secret key's one home, Server Components read and Server Actions write).

**Practices & standards**:
- Record a reversal next to what it reverses, struck and not deleted, so a reader comparing an older spec sees the change was deliberate. (This is how `scope.md` already treats the standing rule.)
- Shared writes, per user reads: shared reference data written by a trusted job, readable by signed in users, never writable by them.
