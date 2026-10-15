# Rationale: Profile line break normalisation · spec 0025

## Context

`src/features/profile/identity-form.tsx`'s summary field and `src/features/profile/experience-form.tsx`'s description field are both textareas, posted and stored as the browser sends them. Chrome, Firefox and Safari all post a textarea's line breaks as `\r\n`. A textarea given that same text back reports it with `\n` only, since the control normalises on read. Nothing between the post and the write undoes that difference today.

Two consequences follow from storing the raw posted text. First, `public.profile.summary` and `public.work_experience.description` both carry a database check of `length(...) <= 4000`, and each line break counts one character the reader never sees as well as the one they do, so a multi line summary can be silently closer to the cap than its visible text suggests. Second, feature 24 already fixed this exact bug on the resume side (`cbdd6a1`, 2026-09-30, found by `/check verify master resume`): a resume editor reopened on its own saved version called itself unsaved before anyone typed, because the saved text (with `\r`) could never equal the text a textarea reports back (without it). The resume fix also normalises the profile seed's own output, since the seed reads these same two profile fields, but that only cleans the copy the seed makes; the two source columns on `profile` and `work_experience` are untouched by it.

Spec 0010 already requires `summary` and `description` to be optional text at most 4000 characters (AC-3, AC-7a), but neither states that the count is of reader visible characters only. This spec makes that explicit and fixes the one place the current behaviour falls short of it.

## Options considered

### Option 1: Normalise at save, backfill unconditionally (chosen)

Fix the save path for both fields, and ship a migration that converts every affected row today, using the same guarded `where exists` shape feature 19 already proved safe to run against rows with nothing to change (basis: `20260921120000_decode_listing_text.sql`, lines 135 to 147).

**Pros**:
- Closes the bug for every row, including one saved between a sizing count and a deploy, which a conditional backfill cannot reach.
- The guard makes an unaffected row's update a no-op, so there is no real cost to running it even where the count turns out to be zero.
- Matches a shape this project has already shipped once (feature 19), reviewed, and tested.

**Cons**:
- Writes and runs a migration even on a database where it may touch nothing.

### Option 2: Normalise at save only, no backfill

Fix the forward path and leave existing rows as they are.

**Pros**:
- Smaller change, no migration to write or run.

**Cons**:
- Every row saved before this fix keeps its hidden `\r` forever. Feature 25's resume tailoring (next in scope after this row) reads `work_experience.description` and `profile.summary` directly; it would keep reading degraded text from any pre fix row for as long as that row exists, the exact problem this feature exists to close before feature 25 starts reading this text.

### Option 3: Normalise at save, backfill gated on a production count being nonzero

Run the sizing query first; write and ship the migration only if it reads nonzero.

**Pros**:
- No migration exists at all on a database where none is needed.

**Cons**:
- Leaves an ordering hole: a row saved between the count and the deploy keeps its `\r` forever, since no later run of this feature exists to catch it.
- The guard that Option 1 already needs (so an unaffected row is untouched) makes the gate pointless; the same guarded update is cheap to run everywhere once it is written.

## Rationale

The forward fix is owed regardless of what any count says, since the bug is observable today in any save, not only in historical data (the Context section's two consequences hold for every future save until this ships). The backfill's shape is settled by feature 19's own precedent rather than invented here: a guarded `update` that only touches matching rows costs nothing extra to run where nothing matches, which is what removes the reason to gate it on a count. Gating it anyway (Option 3) was this spec's first draft, and was corrected on the engineer's own call during design: the gate does not make the fix safer, since the guard already does that job, and it opens a window (between the count and the deploy) that an ungated migration closes.

## References

**Project sources** (verifiable, in this repo):
- `supabase/migrations/20260921120000_decode_listing_text.sql`, lines 135 to 147: feature 19's backfill, an unconditional `update` guarded by `where exists (...)` so it touches only affected rows. This spec copies that shape, and also copies its earlier design: a small, reusable SQL function (`decode_listing_text()`, revoked from every Data API role) that a parity test calls directly, which is why this spec adds `normalize_line_breaks()` instead of two bare `update` statements.
- `src/features/resume/line-breaks.ts:18`: the existing `normalizeLineBreaks` helper, already used by `schemas.ts` and `seed.ts` on the resume side, landed in `cbdd6a1`.
- `docs/scope/scope.md`, feature 39's row: the production count query, and the warning that `like '%\r%'` matches the letter "r" because Postgres reads the backslash as an escape. On 2026-09-30 that mistake counted 2 of 4 local profiles affected when the real count was 0, which is why `position(chr(13) in column) > 0` is the only form used anywhere in this spec.
- Root `AGENTS.md`, the folder by feature rule: logic shared by two features moves to `src/lib`, which is why `normalizeLineBreaks` relocates there rather than being imported across features or duplicated.
