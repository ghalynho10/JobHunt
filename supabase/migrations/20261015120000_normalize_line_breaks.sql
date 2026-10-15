-- Spec 0025 AC-5, AC-6, AC-9: convert the carriage returns already stored in
-- the profile's two textarea fields.
--
-- WHY THIS EXISTS. A browser posts a textarea's line breaks as `\r\n`, and the
-- profile stored `profile.summary` and `work_experience.description` exactly
-- as posted, so a saved value never equalled what the form reopened with and
-- each line break counted twice against the 4000 character cap. The save path
-- now normalises both fields (`multilineText()` in
-- `src/features/profile/schemas.ts`), which fixes every save from here on.
-- Rows written before that fix still hold the `\r`, and this corrects them
-- once, in place.
--
-- THE TWIN OF `normalizeLineBreaks()` in `src/lib/line-breaks.ts`. Both turn
-- every `\r\n` pair and every lone `\r` into `\n` and change nothing else. A
-- parity test (`test/integration/normalize-line-breaks.test.ts`) runs both
-- over the shared cases in `test/fixtures/line-break-cases.ts` and fails if
-- they ever disagree (invariant 1). Change the rule in one and this has to
-- change in a new migration too.
--
-- NO REGEX, ON PURPOSE. Two plain `replace` calls built from `chr()` avoid
-- mixing character codes with escape sequences, whose meaning depends on
-- `standard_conforming_strings`. The order is load bearing: every pair is
-- collapsed first, so the second call only ever sees a carriage return that
-- was alone, and `\r\r\n` comes out as two breaks, the same as the regex
-- `/\r\n?/g` gives.
--
-- REACHABLE BY NO DATA API ROLE (AC-9, invariant 5), the same as
-- `decode_listing_text()`. Nothing outside this migration and the test
-- layer's direct connection has a reason to call it.
--
-- ROLLBACK is `drop function public.normalize_line_breaks(text)`. Rows this
-- converted stay converted: the update only removes a hidden character, so
-- there is no earlier state worth restoring (spec 0025, Migration plan).

create function public.normalize_line_breaks(input text)
returns text
language sql
-- IMMUTABLE and STRICT: the output depends on the input alone, and a null
-- column stays null rather than becoming an empty string.
immutable
strict
parallel safe
set search_path = ''
as $$
  select pg_catalog.replace(
    pg_catalog.replace(
      input,
      pg_catalog.chr(13) || pg_catalog.chr(10),
      pg_catalog.chr(10)
    ),
    pg_catalog.chr(13),
    pg_catalog.chr(10)
  );
$$;

comment on function public.normalize_line_breaks(text) is
'Spec 0025 AC-5, AC-6: turns every CR LF pair and every lone CR into LF and changes nothing else, the same rule as normalizeLineBreaks() in src/lib/line-breaks.ts (a parity test enforces it). Granted to no Data API role.';

revoke execute on function public.normalize_line_breaks(text)
  from public, anon, authenticated, service_role;

-- THE BACKFILL, run once and unconditionally (AC-6): not gated on any count,
-- because the guard already makes it a no-op wherever nothing matches. Only a
-- row holding a carriage return is touched, so every other row is left byte
-- identical, `updated_at` included. A row this does convert gets a new
-- `updated_at` from the `set_updated_at` trigger, which is expected and not
-- suppressed (spec 0025, AC-6).
--
-- `position(chr(13) in ...)`, NEVER `like '%\r%'`: in a `LIKE` pattern the
-- backslash is the escape character, so that pattern matches the letter "r".
--
-- Normalising only ever shortens the text, so no converted row can newly
-- break the `length(...) <= 4000` checks on either column (invariant 3).
update public.profile
set summary = public.normalize_line_breaks(summary)
where position(chr(13) in summary) > 0;

update public.work_experience
set description = public.normalize_line_breaks(description)
where position(chr(13) in description) > 0;
