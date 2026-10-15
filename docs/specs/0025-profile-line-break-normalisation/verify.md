# Verify: Profile line break normalisation · spec 0025

_Steps derived from spec 0025 acceptance criteria and its Critical test scenarios. `/check verify` runs these; `/test` locks the durable ones. Written before the feature is built; boxes tick as `/check verify` actually runs each one against the real app._

## UI / manual

- [ ] Sign in, open `/profile?edit=identity`, type a summary with at least two lines (a real Enter press, not a pasted `\n`), save, then reopen the edit form → the same two lines render → AC-1
- [ ] Read the stored `summary` for that profile directly (`test/helpers/database.ts` or a local `psql` session, never the Data API, which would already normalise nothing) → holds `\n` only, no `\r` anywhere → AC-1, AC-5
- [ ] Same for a work history entry: add or edit one with a multi line description, save, reopen → the lines render the same, and the stored `description` holds `\n` only → AC-2, AC-5
- [ ] Type a summary that normalises to exactly 4000 visible characters across several lines → accepted → AC-3
- [ ] Type a summary that normalises to 4001 visible characters → rejected with the existing over length message, the submitted text kept in the field → AC-3
- [ ] Submit `saveIdentity` directly (bypassing the UI, since no browser reliably posts a `\r` from a single line `<input>`) with a `location` value carrying a `\r` in the middle → stored exactly as submitted, `\r` intact → AC-4

## Commands

Run against the target database. Locally: `docker exec -i supabase_db_jobhunt psql -U postgres -d postgres`, or through `test/helpers/database.ts`'s direct connection for the automated cases.

- [ ] `pnpm test` → the relocated `normalizeLineBreaks` unit tests (now under `src/lib/line-breaks.test.ts` or wherever they land) and the new `multilineText()` unit tests all pass; the existing `src/features/resume/schemas.test.ts` and `src/features/resume/seed.test.ts` pass unchanged → AC-1, AC-2, AC-3, AC-5, AC-7
- [ ] `pnpm test:integration` → the parity test calling `public.normalize_line_breaks()` over the shared case set (`\r\n`, a lone `\r`, a lone `\n`, consecutive breaks, a break at the start, a break at the end, no break at all) agrees with `normalizeLineBreaks()` on every case → AC-5
- [ ] `has_function_privilege('anon', 'public.normalize_line_breaks(text)', 'execute')`, `has_function_privilege('authenticated', 'public.normalize_line_breaks(text)', 'execute')`, `has_function_privilege('service_role', 'public.normalize_line_breaks(text)', 'execute')` → all three `false` → AC-9
- [ ] Seed a `profile` row with `\r\n` in `summary` and a `work_experience` row with `\r\n` in `description`, run the migration's two `update` statements, read both back → `\n` only, and each row's `updated_at` has advanced past its seeded value → AC-6
- [ ] Seed a second `profile` row and `work_experience` row with no `\r` anywhere, run the same `update` statements, read both back → byte for byte identical to what was seeded, `updated_at` included → AC-6
- [ ] `select to_regprocedure('public.normalize_line_breaks(text)')` is not null, and `select pg_get_functiondef('public.normalize_line_breaks(text)'::regprocedure)` shows `immutable`, `strict`, `parallel safe` → AC-5

## Production and jobhunt-dev proof (AC-8)

Taken by the engineer, outside this feature's own code (`test/helpers/database.ts` refuses any non local host). Run the feature 39 sizing query from `docs/scope/scope.md` on each database.

- [ ] **Control check, before trusting any reading**: against each database, prove the sizing query can see a row holding `\r` (a literal `VALUES` based check, or a known row if one exists) → confirms a zero below is a real zero, not a blind instrument → AC-8
- [ ] **Before reading, production**: run the sizing query → record `profiles_with_cr_summary`, `roles_with_cr_description`, `profiles_affected`, `profiles_total` → AC-8
- [ ] **Before reading, jobhunt-dev**: same → AC-8
- [ ] Migration applied to `jobhunt-dev` and to production through the normal deploy pipeline (confirm the CI/deploy log names the migration file) → AC-6
- [ ] **After reading, production**: same sizing query → `profiles_with_cr_summary`, `roles_with_cr_description`, and `profiles_affected` all read 0; `profiles_total` is unchanged from the before reading → AC-8
- [ ] **After reading, jobhunt-dev**: same → AC-8
