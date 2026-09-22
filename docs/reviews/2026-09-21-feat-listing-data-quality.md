# Review, feat/listing-data-quality, 2026-09-21

**Reviewed by**: Claude Sonnet 5 (author on Claude Sonnet 5)
**Scope**: 23 files, branch vs `main` (merge base `a1a034a`)
**Verdict**: Approve with nits

## Summary

Spec 0022 ships three fixes at the Adzuna parse boundary and one production backfill: a single-pass
escape/entity decoder (`decodeListingText()`), a conservative dedup key shared by `/search` and
`/demo` (`listingDedupKey()`/`dedupeListings()`), a formatted-string salary-range comparison, and a
SQL twin of the decoder used to correct four already-stored `application` columns in place. I traced
the decode regex (JS vs Postgres ARE) token by token, including the backslash-doubling and
`&amp;lt;` non-double-decode cases, the JS-vs-SQL whitespace class used for the second trim (SQL's
`edge_space` character class matches ECMAScript's WhiteSpace/LineTerminator set exactly, codepoint
for codepoint), the `strict`/null handling, the no-Data-API-grant claim, and the dedup key's
applied-id tie-break. All of it holds up: I could not construct an input where the SQL function and
`decodeListingText()` disagree, and the shipped parity test (`test/integration/decode-listing-text.test.ts`)
exercises exactly the cases that would expose the classic double-decode bug. Every invariant the spec
states (1–7) is backed by a specific test. `pnpm test` (96 files, 1344 tests), `pnpm typecheck`, and
`pnpm lint` all pass clean on the branch.

## Minor

### 🟡 `dedupeListings()` rebuilds the whole group map on every listing, `src/lib/listing-dedup.ts:88-94`
**Problem**: The `reduce` does `new Map(grouped)` (a full copy) on every iteration instead of
mutating a local accumulator, making grouping O(n²) in allocations.
**Why it matters**: Harmless today — `RESULTS_PER_PAGE` caps a search at 20 listings and a demo
refresh at `KEPT_LISTING_COUNT * 2` = 8 — but it's a needless cost that would matter if either cap
ever grows, and it reads as accidental rather than a deliberate immutability trade-off (the function
is otherwise pure and side-effect free either way).
**Suggested fix**: Build the groups with a single local `Map` mutated inside the loop (still fine
under this project's "no classes, `const`/`readonly`" rule — mutating a local variable that never
escapes the function is not the mutation-in-place the rule targets) or fold with `Map.groupBy` if the
target runtime supports it.

## Nits

- ⚪ `supabase/migrations/20260921120000_decode_listing_text.sql:128-140`, the backfill's `where
  exists` narrows which *rows* are touched, not which *columns* within a touched row are recomputed:
  all four columns are always recomputed for a matched row. `decode_listing_text(..., true)`'s
  retrim then runs unconditionally on `job_title`/`company_name` even when that particular column
  held no escape token, which is a no-op only because every row the app itself has ever written
  already came from a value the Zod schema trimmed at insert (verified: `job_title`/`company_name`
  are written from nowhere but `snapshot.title`/`snapshot.companyName` in
  `src/features/applications/actions.ts:169`). Worth a one-line comment noting that safety
  precondition, since the fixture tests only cover an all-clean row and an all-broken row, not a
  row broken in one column with incidental whitespace in another.

## Strengths

- The SQL/TypeScript parity test runs through the real direct database connection
  (`test/integration/decode-listing-text.test.ts`) rather than inspection, over a fixture list shared
  with the unit test, so the two decoders provably cannot drift silently (invariant 4 is enforced,
  not asserted).
- The Everpure fixture is shared verbatim between `/search`'s dedup test and `/demo`'s walk test
  (`test/fixtures/everpure-pair.ts`), so both screens are proven against the same real pair rather
  than two hand-rolled approximations of it — directly enforces invariant 5.
- The whitespace class used for the SQL side's second trim (`edge_space`) is the exact ECMAScript
  WhiteSpace/LineTerminator set (` `–` `, ` /29`, ` `, ` `, `　`,
  `﻿`, `\xa0`, plus the ASCII set), not an approximation — a detail that's easy to get subtly
  wrong and is instead correct byte for byte.
- Coverage is unusually complete for a change of this size: unit tests for the decoder, dedup key,
  and salary comparison; a wiring test on the page; a demo-walk test; a real end-to-end integration
  test through `searchListings()` replaying a recorded live Adzuna item edited field by field; and
  an integration test proving no Data API role can call the new SQL function.

## Test coverage

Every AC in the spec (1–8) has at least one test that would fail against the pre-fix behavior (the
scope row's own bar: a dedup key test that fails if it hides a real result). No gaps found; the two
items above are aesthetic/latent rather than untested risk. `pnpm test`, `pnpm typecheck`, and
`pnpm lint --max-warnings=0` all pass on the branch as reviewed.
