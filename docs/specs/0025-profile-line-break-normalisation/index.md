# 0025. Profile line break normalisation

**Date**: 2026-10-14
**Status**: In Progress

## Summary

A browser posts a textarea's line breaks as two characters, carriage return plus newline, while a textarea reads the same text back with one character, newline only. The profile's summary and work history description fields store exactly what the browser posted, so a saved value never equals what the form reopens with, and the hidden carriage return counts against the 4000 character limit without being visible to the person typing. This spec normalises both fields at save time and converts every existing row that still holds the hidden character, using the same unconditional, guarded backfill shape feature 19 already proved. It amends spec [0010](../0010-profile-entry/index.md)'s AC-3 and AC-7a.

## Requirements

**User stories**:
- As a signed in user, I want the summary and the work history description I type to be stored exactly as a textarea would read it back, so a saved value and a freshly typed one are never silently different.
- As a signed in user, I want my 4000 character limit to count the text I can see, not a hidden character my browser added when I pressed Enter.

**Acceptance criteria** (the contract, each independently checkable):

- **AC-1**: A summary saved through `/profile`'s identity form is stored with `\n` line breaks only, whatever line ending the browser posted (`\r\n` or a lone `\r`).
- **AC-2**: A work history description saved through `/profile`'s experience form is stored with `\n` line breaks only, the same rule as AC-1.
- **AC-3**: The 4000 character limit on `summary` and on `description` is checked against the normalised text, so a line break counts once, never twice. A submission is normalised before the length check runs. Amends spec 0010's AC-3 and AC-7a, which named the cap but not this counting rule.
- **AC-4**: `profile.location` and `work_experience.location` are not passed through this normalisation. They are single line inputs, not textareas, and are not the bug this spec fixes; a value that somehow reaches one with a `\r` in it is stored as submitted, unchanged by this feature.
- **AC-5**: The normalisation applied at save time (`normalizeLineBreaks` in `src/lib/line-breaks.ts`) converts `\r\n` and a lone `\r` to `\n`, and changes nothing else. A new SQL function, `public.normalize_line_breaks(text)`, does the same thing for the migration, and a parity test proves the two agree over a shared set of cases: `\r\n`, a lone `\r`, a lone `\n` (must stay unchanged), consecutive breaks, a break at the very start, a break at the very end, and text with no break at all.
- **AC-6**: Every existing row in `public.profile` whose `summary` holds a `\r`, and every row in `public.work_experience` whose `description` holds a `\r`, is converted to hold `\n` only, by a migration that runs unconditionally: it is not gated on any production count, and a row holding no `\r` is left untouched (its `update` statement's guard excludes it, so its `updated_at` does not change). This matches feature 19's own backfill shape (`20260921120000_decode_listing_text.sql`), a guarded update that is a no-op wherever nothing matches. A row the migration does convert gets a new `updated_at`, from the existing `set_updated_at` trigger on both tables (`before update`, unconditional); this is expected, not suppressed, and is harmless, since `updated_at` on these two tables is read nowhere except as a listed field name in the privacy notice's stored fields registry (`src/features/legal/stored-fields.ts`), never as a rendered value.
- **AC-7**: `normalizeLineBreaks` lives at `src/lib/line-breaks.ts`, shared by the profile feature (this spec) and the resume feature (`cbdd6a1`'s existing use in `src/features/resume/schemas.ts` and `src/features/resume/seed.ts`), per root AGENTS.md's rule that logic shared by two features lives in `src/lib`. The resume feature's existing tests pass unchanged after the move.
- **AC-8**: The sizing query already written in `docs/scope/scope.md`, feature 39, is run by the engineer against production and against `jobhunt-dev`, once before the migration ships and once after, with the before reading taken only after the same query is proven to see a row already known to hold a `\r` (so a zero reads as a real zero, not a blind instrument). This spec does not gate shipping the backfill on either count; the readings are the proof that it worked, not a precondition for running it.
- **AC-9**: `anon`, `authenticated`, and `service_role` hold no `EXECUTE` on `public.normalize_line_breaks(text)`, checked with `has_function_privilege`, never assumed from the migration's own `revoke` statement. Postgres grants `EXECUTE` on a new function to `PUBLIC` by default, the same default privilege shape feature 38 closed for tables (spec 0003's AC-17 to AC-19); a dropped or reordered revoke here would leave `anon` able to call the function with nothing failing, since nothing currently reaches it to notice.

## Decision

**Chosen option**: Option 1, normalise at save and backfill unconditionally.

Line breaks are normalised at the write boundary for `summary` and `description` only, using a `multilineText(max, message)` helper in `src/features/profile/schemas.ts`:

```ts
function multilineText(max: number, message: string) {
  return z.string().transform(normalizeLineBreaks).pipe(optionalText(max, message));
}
```

`normalizeLineBreaks` itself moves from `src/features/resume/line-breaks.ts` to `src/lib/line-breaks.ts` (basis: root AGENTS.md's folder by feature rule, logic shared by two features moves to `src/lib`), since it is now shared by two features.

A single migration backfills both tables unconditionally, each guarded by `position(chr(13) in column) > 0`, mirroring `20260921120000_decode_listing_text.sql` (basis: `20260921120000_decode_listing_text.sql`, lines 135 to 147). Unlike that precedent's inline `update` statements, the normalisation itself lives in a small, reusable SQL function, `public.normalize_line_breaks(text)`, the same way `decode_listing_text()` does: the function is what a parity test can call directly, proving it agrees with `normalizeLineBreaks` over a shared set of cases, rather than leaving the SQL untestable after the fact (the gap a cross check found in this spec's first draft, which had no function at all).

A named `multilineText()` helper, rather than folding the normalisation into `optionalText()` itself, keeps the fix narrow: `optionalText()` has four call sites today (`profile.location`, `profile.summary`, `work_experience.location`, `work_experience.description`), and only two of them are textareas. Putting the transform inside `optionalText()` would run it on both `location` fields too, a transform with nothing to normalise there since a single line input cannot post a `\r\n`. The named helper also gives the next textarea a clear place to opt in: features 35, 36 and 37 all add profile text in this same phase, so this is a near term need rather than a hypothetical one.

## Feature design

**Data model sketch**:

No new table, column, or constraint. `public.profile.summary` and `public.work_experience.description` keep their existing `length(...) <= 4000` check; normalising line breaks only ever shortens a stored value (one or two hidden characters removed per line break), so no existing row can newly violate that check as a result of this migration.

**State transitions**: None. No new state for the data itself.

**API surface**: No new Server Action and no new route. `saveIdentity`, `addWorkExperience` and `updateWorkExperience` (all in `src/features/profile/actions.ts`, spec 0010) keep their existing shape; only the Zod schema each one parses against changes.

**Value sourcing**:

| Action | Value produced or stored | Source |
|---|---|---|
| `saveIdentity` | the stored `summary` | the identity form's posted textarea value, piped through `multilineText()` (`normalizeLineBreaks` then `optionalText()`'s trim, max, and empty to `undefined` mapping) before the write |
| `addWorkExperience` / `updateWorkExperience` | the stored `description` | the experience form's posted textarea value, the same `multilineText()` pipeline |
| the migration | which rows to update | computed per row at migration time by `position(chr(13) in column) > 0`, never supplied from outside the migration |
| the before and after counts (AC-8) | the two numbers reported | the engineer's own manual run of the feature 39 sizing query against production and `jobhunt-dev`, outside this feature's own code; no part of this feature produces or stores them |

**Key invariants**:
1. `normalizeLineBreaks` (TypeScript) and `public.normalize_line_breaks()` (SQL) are two implementations of the same rule, proven to agree by a parity test over a shared set of cases (`\r\n`, a lone `\r`, a lone `\n` left unchanged, consecutive breaks, a break at the start, a break at the end, no break at all), the same relationship spec 0022's `decode_listing_text()` has with its TypeScript twin. A `\r\n` only fixture set would pass even if the SQL side silently failed to handle a lone `\r`, which is why the lone `\r` case is required, not optional.
2. Normalisation runs before the length check, never after, so the 4000 character limit always judges the text a reader would see (AC-3). Reordering this would reopen exactly the bug this spec fixes.
3. The migration only ever shortens a value; it can never cause an existing row to newly violate `length(...) <= 4000`. It never touches a row holding no `\r` (that row's `update` guard excludes it, so its `updated_at` does not change), but a row it does convert gets a new `updated_at` from the existing, unconditional `set_updated_at` trigger on both tables; this is expected, not a side effect to suppress (see AC-6).
4. `location` fields pass through `optionalText()` unchanged by this spec (AC-4); a future feature that wants the same normalisation on a new textarea field uses `multilineText()` directly rather than widening `optionalText()` itself.
5. `public.normalize_line_breaks(text)` is granted to no Data API role, the same as `decode_listing_text()`: nothing outside this migration and its own parity test has a reason to call it.

**Security model**: Unchanged from spec 0010. Row level security on `profile` and `work_experience` already confines every write to its own owner; this spec adds no new table and no new policy. The migration runs as the project's migration role (`postgres`), which is not subject to row level security, the same as every other migration in this project.

**Configuration required**: None. No new environment variable, secret, or credential.

**Critical test scenarios** (each maps to an acceptance criterion in `## Requirements`):
- Happy path, identity: a summary posted with `\r\n` between two lines is stored with `\n` only, and reopening the edit form shows the same two lines the browser would have shown before saving, verifies **AC-1**, **AC-5**.
- Happy path, experience: a description posted with a lone `\r` (no `\n`) is stored with `\n`, verifies **AC-2**, **AC-5**.
- Length counting, accepted: a summary that normalises to exactly 4000 characters (3997 visible characters plus three `\r\n` line breaks, 4003 raw characters posted) is accepted, verifies **AC-3**.
- Length counting, rejected: a summary that normalises to 4001 characters (3998 visible characters plus three `\r\n`, 4004 raw) is rejected, since the check runs against the normalised length, not the raw posted length, verifies **AC-3**.
- Unaffected field: a `location` value with a `\r` in the middle of it (not at an edge `optionalText()`'s own trim would remove regardless) is stored exactly as submitted, verifies **AC-4**.
- Parity: `public.normalize_line_breaks()` and `normalizeLineBreaks()` agree over the shared case set in invariant 1, verifies **AC-5**.
- Privilege: `has_function_privilege` reads `execute` as false for `anon`, `authenticated`, and `service_role` on `public.normalize_line_breaks(text)`, the same assertion `decode_listing_text()` already passes (verified live 2026-10-14: `anon` false, `authenticated` false, `service_role` false), verifies **AC-9**.
- Backfill, affected row: a `profile` row seeded locally with `\r\n` in `summary` is converted to `\n` only by the migration, with every other column except `updated_at` unchanged, and `updated_at` advanced (the existing trigger firing on the write), verifies **AC-6**.
- Backfill, unaffected row: a `profile` row with no `\r` in `summary` is byte for byte identical, `updated_at` included, after the migration runs (its `update` statement's guard never touches it, so the trigger never fires), verifies **AC-6**.
- Regression: `src/features/resume/schemas.test.ts` and `src/features/resume/seed.test.ts` (the existing tests from `cbdd6a1`) pass unchanged after `normalizeLineBreaks` moves to `src/lib/line-breaks.ts`, verifies **AC-7**.

## Build plan

Ordered for Tracer Bullet: the forward fix (needed today regardless of any count) ships and is proven first; the backfill, which depends on nothing the forward fix doesn't already establish, follows.

1. Move `normalizeLineBreaks` from `src/features/resume/line-breaks.ts` to `src/lib/line-breaks.ts`, updating the two existing imports in `src/features/resume/schemas.ts` and `src/features/resume/seed.ts`. Run the existing resume test suite to confirm nothing regressed. Satisfies **AC-7**.
2. Add `multilineText(max, message)` to `src/features/profile/schemas.ts`: `z.string().transform(normalizeLineBreaks).pipe(optionalText(max, message))`, so normalisation runs first and `optionalText()`'s existing trim, max length check, and empty to `undefined` mapping run on the already normalised text. Wire it into `identitySchema.summary` and `workExperienceSchema`'s `description`, replacing their current `optionalText()` calls. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**.
3. Unit tests for `multilineText()`: a `\r\n` pair and a lone `\r` both become `\n`; the 4000 character cap is checked against the normalised length, not the raw posted length; an empty or whitespace only submission still maps to `undefined`, matching `optionalText()`'s existing behaviour. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-5**.
4. Manual save and reload against the real local stack: post a two line summary with `\r\n` through `/profile`, confirm the stored value and the reopened form both show `\n` only. Satisfies **AC-1**, **AC-2**.
5. Before the migration is written, the engineer runs the feature 39 sizing query against production and `jobhunt-dev`. On a database with no row known to hold a `\r`, prove the query can see one first with a literal control check (e.g. `select position(chr(13) in (values (chr(13) || 'x'))) > 0`) before trusting a zero from the real query; then run it for real and record both counts. This is the engineer's own action outside this feature's code, matching feature 38's own before reading discipline. Satisfies **AC-8**'s before half.
6. Write one new migration, timestamped after `20261005120000_tighten_authenticated_table_privileges.sql`, with two parts in the same transaction. First, `public.normalize_line_breaks(input text) returns text`, `immutable strict parallel safe`, mirroring `normalizeLineBreaks`'s regex (`/\r\n?/g` to `\n`) with no regex on the SQL side, to avoid the confusion of mixing `chr()` with an escape sequence: `replace(replace(input, chr(13) || chr(10), chr(10)), chr(13), chr(10))` (collapse every `\r\n` pair first, then convert any lone `\r` left over). Revoke execute from `public`, `anon`, `authenticated`, and `service_role`, the same as `decode_listing_text()`. Second, two guarded `update` statements, one on `public.profile.summary` and one on `public.work_experience.description`, each `where position(chr(13) in column) > 0`, each calling the new function. Apply it locally with `pnpm db:reset`. Satisfies **AC-6**.
7. Parity test, local and CI only, through `test/helpers/database.ts`'s direct connection: call `public.normalize_line_breaks()` directly over the shared case set (invariant 1: `\r\n`, a lone `\r`, a lone `\n`, consecutive breaks, a break at the start, a break at the end, no break at all) and assert it matches `normalizeLineBreaks()` over the same cases, the same shape as spec 0022's `decode_listing_text` parity test. In the same file, assert `has_function_privilege` reads `execute` as false for `anon`, `authenticated`, and `service_role` on `public.normalize_line_breaks(text)`, mirroring the equivalent check `decode_listing_text()` already passes; this does not reach `table-privilege-drift.test.ts`'s guard, which scans `pg_class` for tables only and does not cover functions. Satisfies **AC-5**, **AC-9**.
8. Local integration test, through the same direct connection: seed one `profile` row and one `work_experience` row with a known `\r`, apply the migration's two `update` statements, confirm both read back with `\n` only and a newer `updated_at`; seed a second pair with no `\r` and confirm both are byte for byte unchanged, `updated_at` included. Satisfies **AC-6**.
9. After the migration ships to production and `jobhunt-dev`, the engineer re-runs the same sizing query on both and compares the after reading against the before reading from step 5, confirming it now reads 0 on both. Satisfies **AC-8**'s after half.

## Consequences

**Positive**:
- Feature 25's resume tailoring (next in scope to read this text) reads clean, normalised profile text from the day it ships, with no pre-fix row left for it to encounter.
- A saved summary or description is always exactly what a textarea reports back, closing the same class of bug feature 24's resume fix already closed on the resume side.
- The shared `src/lib/line-breaks.ts` location means the next feature to add profile free text (35, 36, or 37) imports the fix rather than reinventing it.

**Negative and tradeoffs**:
- The migration runs on every environment, including one where the sizing query reads zero, for a guarded update that then does nothing. This is the accepted cost of closing the ordering hole a conditional backfill would leave open.
- `multilineText()` is a second text helper alongside `optionalText()` and `requiredText()` in `schemas.ts`; a future reader has to know which of the three a given field needs. The doc comment on `multilineText()` carries this distinction.

**Neutral**:
- No new migration touches `profile.location` or `work_experience.location`; they are explicitly out of scope (AC-4).
- `profileSeed()`'s own normalisation (`cbdd6a1`) is unaffected by this spec; it already calls `normalizeLineBreaks` on its output, and continues to after the function's relocation.
- A database check constraint enforcing `position(chr(13) in summary) = 0` after the backfill was considered and rejected here: the application fix already closes the only write path (every save goes through `multilineText()`), so the constraint would duplicate an enforcement this spec already guarantees, for the cost of a second check `/develop` would have to prove never rejects a legitimate value. Left for a later spec if a write path outside the Server Actions ever appears.
- A row the migration converts gets a new `updated_at` (the existing trigger firing on the write); this is expected, not suppressed, and is harmless since no feature reads that column as a value, only lists it in the privacy notice's stored fields registry.

## Follow-up

- [x] **Resolved 2026-10-15, before the build started**: `db233f6` (the commit linking feature 39 to this spec) rewrote the Done when to describe the unconditional, guarded backfill, and the rest of feature 39's row that still carried the conditional framing was corrected while the feature was being built. Original item: Flag to `/scope`: feature 39's Done when line reads "only if the production count below is not zero, existing rows are converted." This spec ships the backfill unconditionally, with no count gate; that line should be corrected once this feature builds, so the row does not under describe what shipped (the same correction feature 38 needed for its own widened scope).
- [ ] Features 35, 36, and 37 (each adding profile free text in this same phase) should use `multilineText()` for any new textarea backed field, rather than `optionalText()`, if that field can realistically receive multi line input.

## Rationale

See [rationale.md](rationale.md).

## Migration plan

**Strategy**: No phased cutover needed. One migration, applied directly: a single transaction, two guarded `update` statements, each a no-op wherever nothing matches. There is no old and new system to run side by side, since the write path and the stored data are fixed by the same change.

**Phases**:
1. Ship the application fix (`multilineText()`, build plan steps 1 to 4) first; every save from this point on stores `\n` only, independent of whether or when the backfill runs.
2. Engineer takes the before reading on production and `jobhunt-dev` (build plan step 5), proving the sizing query can see a known `\r` first.
3. Apply the migration (build plan step 6) to local, then to `jobhunt-dev` and production through the normal deploy pipeline, in the same transaction per database.
4. Engineer takes the after reading (build plan step 9) on production and `jobhunt-dev`, confirming both now read 0.

**Rollback**: The application fix reverts by reverting its commit; no stored data depends on it existing (a `\r\n` already converted by the migration stays converted whether or not the save path still normalises). The migration itself is not rolled back once applied: it only ever shortens stored text by removing a hidden character, so there is no prior state worth restoring, and nothing before the migration depended on a row still holding `\r`.

**Risks**: A row written between the before reading and the migration landing on that same database would be included in the migration's own `where position(chr(13) in column) > 0` guard (it runs at migration time against the live table, not against a snapshot), so this is not a real risk once the migration has actually been applied; it only matters for how the before and after counts are read as a before and after pair, not for whether every `\r` holding row gets converted. The one window that does matter is between the application fix and the migration both landing: as long as phase 1 (the application fix) ships before phase 3 (the migration), no new `\r` holding row can be created after phase 1, since every save already goes through `multilineText()` by then, and the migration's live guard still catches whatever was written before it. This spec does not require two separate deploys to close that window; it requires the order in Phases above to hold.
