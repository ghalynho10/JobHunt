# 0022. Listing data quality

**Date**: 2026-09-21
**Status**: Accepted

## Summary

The same job could come back from Adzuna under two ids, though no confirmed case is on record yet
(the one pair seen, Everpure, is most likely two distinct roles). Real postings also carry escaped
characters like `\n` printed as literal text instead of a line break, and a salary range that is
really one figure repeated twice. This spec fixes the incoming data rather than switching job
board, and it fixes the escaped text at the one place it enters the app so both the live search page
and every already saved application record end up correct, not just the screen. It keeps two
different roles at the same company as two separate results on purpose, even when that looks at
first glance like a duplicate.

## Requirements

**User stories**:
- As a signed in user searching for jobs, I want the same real posting to appear once, not twice
  under two different ids, so the result list reflects real, distinct opportunities.
- As a signed in user, I want a job's description to read as normal text, not as raw code with
  stray backslashes and letters where a line break belongs, so a listing is not harder to read than
  the source that provided it.
- As a signed in user who already applied to a job, I want that applied state to still show
  correctly even when the same posting is later shown to me under a different Adzuna id.
- As the operator, I want a listing that was already saved with broken text (before this fix
  shipped) to read correctly too, not just new ones going forward.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: Two listings returned by the same Adzuna search whose company name, title, and
  location are equal after normalizing (case folded, trimmed, internal whitespace collapsed to one
  space) collapse into a single rendered result, on `/search` and in the `/demo` refresh alike. Two
  distinct listings (different `sourceJobId`) with an absent or empty (after normalizing) location
  never collapse with each other, whatever their company and title: an absent location matches no
  other listing's location, not even another absent one, so two same titled roles at one company
  that both lack a location stay distinct rather than being merged by a blank field. This rule is
  about two different listings, not the same listing seen twice: `/demo`'s own walk (AC-8) still
  must recognize the very same `sourceJobId` returned by both of its searches as one listing, which
  is why the "no match" behavior for an absent location is keyed off the listing's own identity (see
  `listingDedupKey()` below), not a fresh, unrepeatable value on every call.
- **AC-2**: Two listings whose normalized titles differ are never collapsed, even at the same
  normalized company and location. Proven by a test using the real Everpure pair (Adzuna ids
  `5883839578` and `5883870504`, titles "Software Engineering Manager, Platform" and "Software
  Engineer") as a fixture that must still render as two distinct results, the test the scope row's
  own **Done when** asks for: a dedup key that would fail if it hid a real result.
- **AC-3**: When a collapsed group contains an id the caller has already applied to, the kept
  representative is that id, so the card, its "View the posting" link, and its apply control all
  refer to the same id an existing application row names. When more than one id in the group
  carries an application (possible if the caller applied to two sibling ids before this feature
  shipped), the earliest such id in Adzuna's returned order is kept. When no id in the group carries
  an application, or the applied ids read itself failed, the first occurrence in Adzuna's returned
  order is kept; in that failure case a sibling id may still be shown as not applied even though the
  caller applied to another id in the same group, which is disclosed by the existing `COPY-8` alert
  rather than silent, and a second application to that sibling remains possible until the read
  succeeds again.
- **AC-4**: Every occurrence of the escape sequences `\n`, `\r`, `\t`, `\"`, `\\`, and the HTML
  entities `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;` inside a listing's title, company name,
  location, or description is decoded to its real character, at the Adzuna parse boundary
  (`src/features/search/adzuna.ts`), before the value is ever rendered or stored. The decode is a
  single pass over one regular expression alternating all ten tokens, left to right, so that (a) the
  three character input backslash, backslash, `n` decodes to a literal backslash followed by `n`,
  never to a newline, and (b) the five character input `&amp;lt;` decodes to the four characters
  `&lt;`, never to `<`. Both are proven by dedicated tests. A field that is absent (`location` and
  `description` are both optional on `adzunaItemSchema`) is never decoded and never becomes an
  empty string; absence stays absence. `title` and `company.display_name` are trimmed by the Zod
  schema before this transform runs; because a decoded escape can introduce leading or trailing
  whitespace the original trim never saw (a decoded `\n` at either edge, for one), the decoded value
  is trimmed again before the `Listing` is built. That second trim does not by itself guarantee a
  non-empty result: a `title` or `company.display_name` made up only of escapes that decode to
  whitespace becomes an empty string. Such a listing is dropped at the parse boundary as invalid,
  through the existing drop and count path spec 0013 already defines for an item that fails its own
  parse, and is never rendered or inserted with an empty title or company, which is what keeps spec
  0014 AC-13's non-empty guarantee true at insert. The backfill's SQL function applies the same
  re-trim to `job_title` and `company_name`, so a stored row ends up matching what a new write would
  have produced; where that re-trim would leave either column empty, the function leaves that
  column's stored value unchanged rather than violating the table's own `length(trim(...)) > 0`
  check and failing the whole migration, and the row stays visible to the post backfill count
  (Follow-up) rather than being silently altered.
- **AC-5**: A backslash sequence or an HTML entity left over after decoding is reported through
  `Sentry.captureMessage` at warning level, carrying the source id and the unrecognized fragment as
  context, grouped by a fixed message text so repeats do not open a new Sentry issue each time. Left
  over means exactly: a backslash followed by any character other than `n`, `r`, `t`, `"`, or `\`;
  or a `&` starting a sequence matching `&[a-zA-Z]+;`, `&#[0-9]+;`, or `&#x[0-9a-fA-F]+;` that is not
  one of the five named entities in AC-4. Anything else (an ordinary `&` in running text, a bare
  backslash in a file path) is not reported. The value still renders and still stores with the
  fragment intact; nothing is dropped and nothing throws.
- **AC-6**: A listing whose stated salary minimum and maximum render to the same formatted display
  string (after rounding) shows as one figure, never as a range of that figure to itself, even when
  the two raw numbers differ by a fraction a viewer would never see. The comparison is on the
  formatted strings, not on a numeric rounding shortcut (e.g. not `Math.round(min) ===
  Math.round(max)`), so it stays correct if the display format ever changes independently of this
  rule.
- **AC-7**: Every existing `application.job_title`, `company_name`, `job_location`, and
  `job_description` value already containing one of AC-4's escape sequences is corrected once, in
  place, by a migration that applies the identical decoding rule as AC-4 to all four columns (the
  same named SQL function used by both the migration and a parity test comparing its output to the
  TypeScript decoder's, on the same fixtures, including the backslash, backslash, `n` and the
  `&amp;lt;` cases). Every row's total count is unchanged; a row with none of these sequences is
  byte identical before and after; only already broken values change content.
- **AC-8**: `src/features/demo/refresh.ts`'s own id only de-duplication (its `seen` set, keyed on
  `sourceJobId`) is replaced by AC-1's key, so `/demo` collapses duplicates the same way `/search`
  does.

## Options considered

Reasoning and the options weighed: see [rationale.md](rationale.md).

## Decision

**Chosen option**: Fix the incoming listing data in place, at the point it is parsed and at the
point it was already stored, rather than switching job board or adding a third party normalization
service.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**:

No new table and no new column. `application.job_title`, `company_name`, `job_location`, and
`job_description` (all existing, spec 0003) are the four columns this feature's data touches,
corrected once by the migration in Build plan step 7: all four store raw text copied from the same
`Listing` fields AC-4 decodes, written at insert time by `src/features/applications/actions.ts`
(`queries.ts` only reads these columns back), so a backfill limited to `job_description` alone
would leave the other three permanently wrong, the exact failure mode this spec's
decode-at-the-boundary decision exists to prevent. The feature adds one new database object:
a SQL function (name `public.decode_listing_text`, or whatever `/develop` finalizes) that mirrors
the TypeScript decoder exactly, used by the backfill statement and by the parity test. It carries no
grant reachable through the Data API (see Security model), unlike `get_job_search_usage_summary`,
because nothing outside the migration and the test's direct connection has a legitimate reason to
call it.

**State transitions**: none. Neither a `Listing` nor the dedup grouping is persisted; both stay
request scoped, same as spec 0013's own invariant 6.

**API surface** (internal module surface changed or added, no new route or endpoint):

| Surface | Kind | Key inputs | Key outputs | Notes |
|---|---|---|---|---|
| `decodeListingText()`, new, `src/lib/listing-normalize.ts` | pure function | raw string, plus `context: { sourceJobId: string; field: "title" \| "companyName" \| "location" \| "description" }` | decoded string | single pass; reports a leftover fragment via `Sentry.captureMessage` (using `context`) rather than returning an error, satisfies AC-4, AC-5 |
| `adzunaItemSchema`'s transform, `src/features/search/adzuna.ts` | Zod transform | raw Adzuna item | `Listing` | now calls `decodeListingText()` on `title`, `company.display_name`, `location.display_name`, and `description` before building the `Listing`, each with its own `context`, satisfies AC-4 |
| `listingDedupKey()`, new, `src/lib/listing-dedup.ts` | pure function | one `Listing` | a string key: the normalized `companyName`/`title`/`location` joined when `location` is present and non-empty; otherwise a key built from the normalized `companyName`/`title` plus the listing's own `source`/`sourceJobId` (AC-1) | pure and deterministic: the SAME listing (same `sourceJobId`) always yields the SAME key on every call, which is what lets `/demo`'s walk (AC-8) still recognize its own listing returned twice as one, while two DIFFERENT listings that both lack a location never share a key; the shared key both `dedupeListings()` and `refreshDemoResults()`'s loop group by, so the two never compute duplicates differently |
| `dedupeListings()`, new, `src/lib/listing-dedup.ts` | pure function | `Listing[]`, `ReadonlySet<string> \| undefined` (appliedIds) | `Listing[]` | groups by `listingDedupKey()`, keeps the earliest id present in `appliedIds` per group when one or more exist, else the first occurrence, satisfies AC-1, AC-2, AC-3 |
| `SearchOutcome`, `src/app/(app)/search/page.tsx` | Server Component | the raw `listings` array, the resolved `appliedIds` | the deduped `listings` used by `ResultList`, the Suspense fallback, and `scoreListings()` | calls `dedupeListings()` once, right after `Promise.all([readAppliedJobIds(...), readScoringProfile()])` resolves, replacing `listings` for those three consumers; the earlier `listings.length === 0` empty check (AC-4 of spec 0013) still runs on the raw array, which is safe because dedup never turns a non-empty list into an empty one |
| `salaryText()`, `src/lib/listing-format.ts` | pure function | `SalaryFigures` | formatted string or `undefined` | the equal check moves from comparing raw `salaryMin`/`salaryMax` to comparing their formatted strings, satisfies AC-6 |
| `keepListings()`'s `seen` check, `src/features/demo/refresh.ts` | internal loop (`nextUnseen`) | the same raw listings its two searches already return | the same shape, deduped | `seen: Set<string>` (currently `sourceJobId`) becomes `Set<string>` of `listingDedupKey()`'s output, since `keepListings()` walks one listing at a time and cannot call the batch shaped `dedupeListings()`; the tie rule at equal rank (backend before frontend, spec 0021) is unchanged, satisfies AC-8 |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| dedup a batch of listings | the normalized company/title/location used as the grouping key | `Listing.companyName` / `Listing.title` / `Listing.location`, already parsed from Adzuna; normalized by case folding, trimming, and whitespace collapse; when `location` is absent or empty, the key falls back to company/title plus the listing's own `source`/`sourceJobId`, so it stays deterministic per listing without ever matching a different listing on a blank location, per AC-1 |
| dedup a batch of listings | which id (if any) in a group is the applied one, and the tie break when more than one id is | the existing `readAppliedJobIds()` read, already run against every raw id before this feature, unchanged; the tie break (earliest in Adzuna's order) is decided within `dedupeListings()`, no new input |
| decode a listing's text | the decoded value | the same raw Adzuna field (`title`, `company.display_name`, `location.display_name`, `description`) the app already parses, run through `decodeListingText()` |
| report an unrecognized fragment | the source id and fragment attached to the Sentry message | `decodeListingText()`'s own `context.sourceJobId` and `context.field` parameters (threaded in from `raw.id` and the field name at each of the four call sites in `adzunaItemSchema`'s transform), and the leftover substring the decoder's single pass could not resolve |
| backfill `application.job_title` / `company_name` / `job_location` / `job_description` | the corrected value | the SQL function applying the identical rule as `decodeListingText()`, run once by the migration over each column's existing rows |
| the pre and post backfill row counts | the numbers recorded before and after the migration runs in production | a count query the engineer runs by hand against production: `select count(*) from application where job_title ~ <pattern> or company_name ~ <pattern> or job_location ~ <pattern> or job_description ~ <pattern>`, where `<pattern>` matches any of AC-4's ten known escape sequences and entities, the same set the SQL function decodes (never AC-5's "left over" set, which is the ten's complement); not a value the app computes or displays (see Follow-up) |
| equal salary range check | whether min and max render as one figure | `salaryText()`'s own formatted string for each, compared to each other, no new input |

**Key invariants**:

1. A dedup group never merges two listings whose normalized titles differ, whatever their company
   or location. The Everpure fixture (AC-2) is the test that must keep failing to merge them.
2. A dedup group never merges two DIFFERENT listings on an absent or empty location; only a real,
   equal, normalized location value can match across different listings. This is deliberately the
   same conservative direction as invariant 1: a blank field is never treated as a point of
   agreement. `listingDedupKey()` stays pure and deterministic to hold this and AC-8 at once: the
   same listing (same `sourceJobId`) always yields the same key, so `/demo`'s walk still recognizes
   its own listing seen twice, while two distinct listings that both lack a location never collide.
3. Every consumer of a `Listing`'s `title`, `companyName`, `location`, or `descriptionSnippet`
   receives text with AC-4's escape set already decoded; nothing downstream (render, storage,
   scoring) decodes or normalizes it a second time.
4. The SQL decode function and the TypeScript decoder produce byte identical output on the same
   input, enforced by a parity test that fails the build if they diverge, not by inspection.
5. `/search` and `/demo` compute duplicates with the same key (`listingDedupKey()`), so the same
   pair of real Adzuna ids is never a duplicate on one screen and two distinct results on the other.
6. Whenever the applied ids read succeeds, a collapsed group's kept id is the one carrying an
   existing application (the earliest such id, if more than one); an application record is never
   hidden behind a card showing a different id while that read succeeds. When the read itself fails,
   this cannot be guaranteed: the kept id may be an unapplied sibling, which `COPY-8`'s existing
   alert discloses rather than hides, and a second application to that sibling remains possible until
   the read next succeeds.
7. The SQL decode function grants no execute privilege reachable through the Data API (no anon, no
   authenticated grant); only the migration's own statement and the test's direct database
   connection may call it.

**Security model**:

No new authorization rule. `/search` keeps spec 0013's existing model (a signed in caller only, via
the `(app)` layout guard); this feature adds no path that reads or writes another caller's data.
The one new database object, the SQL decode function, is a Postgres object with no Data API grant,
following the same "revoke execute from public" pattern every earlier function migration in this
repo already uses (`before_user_created_hook`, `usage_gating`, `job_search_usage_summary`,
`demo_result`), except this function is granted to no role at all rather than to `authenticated`,
since nothing outside the migration and `test/helpers/database.ts`'s direct connection has a reason
to call it. The backfill itself reaches production the way every other schema change does, through
the reviewed migration pipeline (spec 0002 AC-11), never through a standalone script and never
through `src/lib/supabase/secret.ts`, whose caller list stays closed (binding rule 1).

**Configuration required**: none. No new environment variable, no new credential.

**Critical test scenarios** (each maps to an acceptance criterion above):

- Happy path: two raw listings with equal normalized company, title, and location collapse to one
  rendered result, verifies **AC-1**.
- No location match: two DIFFERENT raw listings (different `sourceJobId`) with equal normalized
  company and title, both with an absent location, stay two results; the SAME listing (same
  `sourceJobId`) with an absent location yields the same key on two separate calls, verifies
  **AC-1**.
- The Everpure fixture: the same two real ids, different titles, render as two results, verifies
  **AC-2**.
- Applied preference: a group of two ids where the caller has applied to the second one keeps that
  id as the representative; a group of three ids where two carry an application keeps the earlier of
  the two; a group where the applied read failed falls back to first occurrence, verifies **AC-3**.
- Decode correctness: a description containing `\n` decodes to a line break; a description
  containing the literal three character sequence backslash, backslash, `n` decodes to a literal
  backslash followed by `n`, never a line break; a description containing `&amp;lt;` decodes to the
  four characters `&lt;`, never to `<`, verifies **AC-4**.
- Decode to empty: a listing whose `title` (and separately one whose `company.display_name`) is made
  up only of escapes that decode to whitespace is dropped at the parse boundary through the existing
  drop and count path and never reaches render or insert; the same input run through the SQL
  function leaves the stored column unchanged rather than raising, verifies **AC-4**, **AC-7**.
- Unrecognized fragment: a description containing a backslash sequence outside the known set, and
  separately one containing an HTML entity outside the five named ones, each reports a
  `Sentry.captureMessage` at warning level carrying the source id and field, and each still renders
  the fragment, verifies **AC-5**.
- Equal salary: `salaryMin: 109440.2` and `salaryMax: 109440.4` render as one figure, not a range,
  verifies **AC-6**.
- Backfill parity: the SQL decode function and `decodeListingText()` produce identical output on a
  shared fixture set, including the backslash, backslash, `n` and `&amp;lt;` cases, run through
  `test/helpers/database.ts`'s real connection, verifies **AC-7**.
- Backfill scope: seeding one `application` row with an undecoded sequence in `job_title` and a
  clean second row, running the SQL function over both, asserts the first row's four columns decode
  correctly, the second row is byte identical, and the total row count is unchanged, verifies
  **AC-7**.
- `/demo` dedup: the same Everpure and synthetic duplicate fixtures, run through `keepListings()`'s
  own turn taking path instead of `/search`'s, using the shared `listingDedupKey()`, verify **AC-1**,
  **AC-2**, **AC-8**.

## Build plan

Ordered for Tracer Bullet, this project's build approach (`AGENTS.md`): the decode and dedup logic
is proven end to end on `/search`, the one real path a reader sees today, before it is extended to
`/demo`, and the highest risk, live data touching step (the production backfill) runs last, after
everything it depends on is already proven correct.

1. Build `src/lib/listing-normalize.ts`: `decodeListingText(raw, context)`, the single pass decoder
   (one regex alternating all ten tokens) for the escape set in AC-4, taking a
   `{ sourceJobId, field }` context and reporting a leftover fragment through
   `Sentry.captureMessage` per AC-5's exact definition of "left over". Unit tests cover the plain
   `\n` case, the backslash, backslash, `n` non double decode case, the `&amp;lt;` non double decode
   case, and one leftover fragment case for each of a stray backslash and a stray entity. Also add
   a shared fixture file (e.g. `test/fixtures/decode-cases.ts`) exporting the input/output pairs
   used both here and by Build plan step 7's parity test, so the two can never drift apart while
   each stays green on its own. Satisfies **AC-4**, **AC-5**.
2. Wire `decodeListingText()` into `adzunaItemSchema`'s transform in `src/features/search/adzuna.ts`,
   applied to `title`, `company.display_name`, `location.display_name`, and `description`, each with
   its own `context`, before the `Listing` shape is built. `title` and `company.display_name` are
   trimmed again after decoding; an item whose decoded `title` or `company.display_name` is empty is
   dropped through the existing drop and count path (AC-4). Absent `location` and `description`
   are left absent, never decoded to an empty string. Extend the existing Adzuna fixture test with
   a PNC style `\n` case and a decodes-to-empty case. Satisfies **AC-4**.
3. Build `src/lib/listing-dedup.ts`: `listingDedupKey()`, a pure, deterministic function of one
   `Listing`, normalizing company, title, and location (case fold, trim, collapse internal
   whitespace) into a key when location is present and non-empty; when it is absent or empty, the
   key instead builds from the normalized company/title plus the listing's own `source`/
   `sourceJobId`, so the same listing always yields the same key (needed by AC-8) while two
   different listings that both lack a location never share one (AC-1). `dedupeListings()` groups a
   `Listing[]` by that key and keeps the earliest id present in `appliedIds` per group when one or
   more exist, else the first occurrence. Unit tests: the Everpure fixture stays two results, a
   synthetic true duplicate (same key, two ids) collapses to one, two DIFFERENT listings sharing a
   company and title but both lacking a location stay two results, the SAME listing's key is stable
   across two calls, the applied id preference with a two id and a three id (two applied) group, and
   the fallback when `appliedIds` is `undefined`. Satisfies **AC-1**, **AC-2**, **AC-3**.
4. Wire `dedupeListings()` into `src/app/(app)/search/page.tsx`'s `SearchOutcome`, called once right
   after the existing `Promise.all([readAppliedJobIds(...), readScoringProfile()])` resolves, and
   its result replaces `listings` for `ResultList`, the render below it, and `scoreListings()`. The
   earlier `listings.length === 0` empty check keeps reading the raw array; dedup never empties a
   non-empty list, so this is safe. Satisfies **AC-1**, **AC-2**, **AC-3**.
5. Fix `salaryText()` in `src/lib/listing-format.ts`: compare the formatted strings for min and max
   rather than the raw numbers before deciding whether to render a range. Extend its existing test
   with the near equal cents case (`109440.2` / `109440.4`). Satisfies **AC-6**.
6. Replace `src/features/demo/refresh.ts`'s `seen` set (keyed on `sourceJobId` alone, inside
   `keepListings()`'s `nextUnseen` walk) with the same `listingDedupKey()` from step 3, reusing the
   shared module rather than a second implementation. `keepListings()` stays a per-listing streaming
   walk; only what `seen` stores changes. Satisfies **AC-8**.
7. Write the migration: a named SQL function mirroring `decodeListingText()` exactly (same single
   pass alternation over the same ten tokens, and the same re-trim of `job_title` and
   `company_name`, leaving a column unchanged where the re-trim would empty it), granted to no Data
   API role (revoke execute from public, no further grant), plus a statement that runs it once over every existing
   `application.job_title`, `company_name`, `job_location`, and `job_description` value containing
   one of AC-4's sequences. Add the parity integration test (`test/helpers/database.ts`) asserting
   the SQL function and `decodeListingText()` agree on step 1's shared fixture set, and a backfill
   scope test seeding one broken row and one clean row, asserting the broken row's four columns
   decode correctly, the clean row is byte identical, and the total row count is unchanged.
   Satisfies **AC-7**.
8. Engineer step, not code: before this migration merges, run its row count query against
   production and record the matching count and the total `application` row count (see
   Follow-up); after it deploys, confirm the total is unchanged and inspect every row that still
   matches. The matching count is not expected to reach zero, because a correctly decoded row can
   still match the pattern. Satisfies **AC-7**.

## Consequences

**Positive**:
- Genuine duplicates collapse without risking a real distinct role being hidden, closing the
  riskiest of feature 19's four **Done when** clauses.
- Description text reads clean on every screen that renders one (`/search`, `/applications`,
  `/demo`), live and already stored alike, closing a defect visible in a real capture since
  2026-09-13.
- The equal salary range gap the scope row flagged is closed on the same reasoning basis as
  [#130](https://github.com/ghalynho10/JobHunt/pull/130)'s earlier fix.
- `/demo` and `/search` can no longer disagree about what counts as a duplicate, since both call the
  same key.

**Negative / tradeoffs**:
- Decoding at the Adzuna parse boundary is a deliberate, narrow exception to `AGENTS.md`'s "store
  raw, format at render" rule. Accepted because the escaped text is a display snapshot nothing in
  this app computes on, and fixing it once at the boundary is the only way a stored application row
  is ever correct, not only a live render.
- The dedup key is conservative by design: a real duplicate whose title was reworded even slightly
  by the source (an added "II", a punctuation change) still renders as two results. Accepted because
  no confirmed duplicate has been observed on real data yet to calibrate a looser key against, and a
  key that merges too eagerly risks the exact silent loss this feature exists to prevent.
- The contradicting estimate defect, a predicted salary at odds with a figure the posting's own text
  states, stays unfixed. Deferred to Follow-up.
- The backfill migration writes to real, already stored `application` rows in production. Even
  reviewed through CI, a bug in the SQL function reaches real data, mitigated by the parity test and
  the manual pre and post row count check, not eliminated by them.

**Neutral**:
- One new database object (a SQL function), no new table, no new column.
- `src/features/demo/refresh.ts`'s accumulation loop changes shape, from a plain set of seen ids to
  the shared grouping key; worth the engineer's own review given how load bearing that loop's
  ordering already is (spec 0021).

## Follow-up

- [ ] Amend `docs/scope/scope.md` feature 19's **Done when** clause "outliers are handled visibly
      rather than shown as fact." It is already satisfied by spec 0013 AC-7's existing "(estimated)"
      label; no new outlier detection is built here. Batch relative detection was considered and
      rejected: a batch of at most 20 results, mostly predicted, would flag noise rather than a real
      outlier. This is a `/scope` edit, not performed by this spec.
- [ ] The Adzuna predicted salary contradicting a figure the posting's own description states
      (observed once, 2026-09-13, `docs/session-notes.md`, no listing id or figures recorded) is
      deferred, not built here. The next time a card shows this, record the listing id, both
      figures, and the snippet text, so a future design starts from a real case rather than one
      unrecorded sighting. If it is ever built, showing both figures flagged as conflicting is
      preferred over suppressing the estimate, since suppression without telling the reader would be
      a silent failure.
- [ ] Before the Build plan step 7 migration merges, run its row count query against production
      (Feature design, Value sourcing: a count of `application` rows whose `job_title`,
      `company_name`, `job_location`, or `job_description` matches one of AC-4's ten known escape
      sequences or entities) and record that matching count and the total `application` row
      count (in this item or in `docs/session-notes.md`). After it deploys, confirm the total is
      unchanged, and inspect every row that still matches. **The matching count is not expected to
      reach zero**, because a correctly decoded row can still match the pattern: `&amp;lt;`
      decodes once to `&lt;`, and an escaped backslash followed by `n` decodes to a literal
      backslash and `n`, and the pattern matches both. Each row that still matches must be either
      a once decoded double escape of that kind, or a `job_title` or `company_name` that would
      decode to blank and was kept as stored (AC-4). A matching row that is neither is a defect in
      the backfill.
- [ ] Whether Adzuna's own `id` is a reliable key on its own remains untested: no confirmed duplicate
      has been observed on real data (the Everpure pair turned out to be two distinct roles, see
      Context in [rationale.md](rationale.md)). The composite key this spec chooses is the
      conservative answer for exactly that reason. Revisit if a real duplicate is ever observed with
      a shape the Done when's own test case does not already cover.
- [ ] **The first duplicate shaped pair on record, seen on the `/demo` refresh against production on
      2026-09-22, after this feature shipped.** Two cards for Tetrate, both titled "Lead Frontend
      Engineer", with byte identical snippets, kept apart only because their locations read "US" and
      "Trammells, Harris County", and carrying different estimated salaries ($126,109 and $161,784).
      **Better evidence than the Everpure pair**, whose titles differ: here the company and title
      match, so location is the only field holding the two apart. That same refresh met AC-8 and
      AC-2, since no two kept cards shared company, title and location.
      **The key is not changed on one sighting**, and that is a decision rather than an omission:
      dropping location from the key would merge genuine roles in different cities, the silent loss
      this feature exists to prevent (Consequences, and invariant 1's reasoning applied to the
      location field).
      The open question for a later pass, and it is a question for `/architect`, not for a build:
      should a pair at the same company and title, with a byte identical snippet, differing only by
      location, collapse at all; and if it should, which location the kept card shows. A third
      sighting with figures recorded would make that decision on evidence rather than on two cases.

## Migration plan

**Strategy**: no migration needed for the request scoped logic (the decoder, the dedup key, the
salary comparison fix); those ship as one ordinary code release. The SQL function plus the one-time
backfill statement (Build plan step 7) is the part of this feature that is a real migration, because
it transforms existing live data in `application.job_title`, `company_name`, `job_location`, and
`job_description`.

**Phases**:
1. Ship Build plan steps 1 through 6 (the decoder, the dedup key, the salary fix, wired into
   `/search` and `/demo`). This alone stops new corruption and new duplicates from reaching either
   screen or storage, but leaves already stored rows uncorrected.
2. Ship the migration from Build plan step 7. It reaches production through the existing reviewed
   pipeline (spec 0002 AC-11, on merge to `main`), the same path every other schema change in this
   repo already takes.
3. The engineer runs the pre and post row count check by hand (Follow-up), since this touches real
   user data and is deliberately not an automatic part of deploy.

**Rollback**: the SQL function is additive, a new function with no column or type change, so
reverting the migration is a plain `drop function`. Rows the backfill already corrected stay
corrected even if the function is later dropped, since the update ran once rather than staying a
live dependency. Reverting the TypeScript decoder alone (phase 1) does not undo anything the
backfill already fixed in storage.

**Risks**: the decode rule could over correct a posting whose text genuinely contained one of the
five HTML entities on purpose rather than as source encoding noise; mitigated by keeping the entity
set to exactly the precautionary five named in AC-4 and by the parity test. Running the backfill
against the wrong environment is mitigated structurally, by it living inside a reviewed, environment
scoped Supabase migration rather than a standalone script touching a database directly.
