-- Spec 0022 AC-7: decode the escaped text already stored on `application`.
--
-- WHY THIS EXISTS. Adzuna sends the two characters backslash and `n` inside
-- listing text, and a small set of HTML entities, and the app used to print
-- them verbatim. Feature 19 now decodes them once at the parse boundary
-- (`src/lib/listing-normalize.ts`), which fixes every listing from here on.
-- But applying copies a listing onto an `application` row, so every row saved
-- before that fix still holds the literal characters, and would keep them for
-- as long as the row exists. This corrects those rows once, in place.
--
-- THE TWIN OF `decodeListingText()`. The function below applies the SAME rule
-- as the TypeScript decoder: the same ten tokens, one pass, left to right, so
-- `\\n` (backslash, backslash, `n`) becomes a backslash and a plain `n`, never
-- a newline, and `&amp;lt;` becomes `&lt;`, never `<`. A parity test
-- (`test/integration/decode-listing-text.test.ts`) runs both over the shared
-- cases in `test/fixtures/decode-cases.ts` and fails if they ever disagree
-- (spec 0022, invariant 4). Change the token set in one and this has to change
-- in a new migration too.
--
-- REACHABLE BY NO DATA API ROLE (invariant 7). Nothing outside this migration
-- and the test layer's direct connection has a reason to call it, so execute
-- is revoked from `public` and from the three roles Supabase's default
-- privileges grant it to, and granted back to none of them. This differs from
-- `get_job_search_usage_summary`, which `authenticated` does call.
--
-- ROLLBACK is `drop function public.decode_listing_text(text, boolean)`. Rows
-- this corrected stay corrected: the update ran once, and no column depends on
-- the function afterwards.

create function public.decode_listing_text(
  input text,
  retrim boolean default false
)
returns text
language plpgsql
-- IMMUTABLE and STRICT: the output depends on the input alone, and a null
-- column (`job_location`, `job_description`) stays null rather than becoming
-- an empty string, the same "absence stays absence" rule AC-4 sets.
immutable
strict
parallel safe
set search_path = ''
as $$
declare
  -- The ten tokens of AC-4, as a Postgres ARE. Under standard conforming
  -- strings, `\\` here is the regex's own escaped backslash, so `\\n` matches
  -- the two characters backslash and `n`. No two tokens can match at the same
  -- position, so Postgres's longest match and JavaScript's first match agree.
  token_pattern constant text :=
    '\\n|\\r|\\t|\\"|\\\\|&amp;|&lt;|&gt;|&quot;|&#39;';
  -- JavaScript's `String.prototype.trim()` removes exactly this set (ECMAScript
  -- WhiteSpace and LineTerminator). Postgres's `trim()` removes only spaces, so
  -- using it would leave a decoded newline at the edge where the TypeScript
  -- side removes it, and the two would disagree on a stored title.
  edge_space constant text :=
    '^[ \t\n\v\f\r   -     　﻿]+'
    '|[ \t\n\v\f\r   -     　﻿]+$';
  remaining text := input;
  decoded text := '';
  token_at integer;
  token text;
  trimmed text;
begin
  -- ONE PASS: each match is replaced and the scan resumes AFTER it, so a
  -- decoded character is never scanned again. That is what rules out a double
  -- decode, and it is why this is a loop rather than ten `replace()` calls.
  loop
    token_at := pg_catalog.regexp_instr(remaining, token_pattern);
    exit when token_at = 0;

    token := pg_catalog.regexp_substr(remaining, token_pattern);

    decoded := decoded
      || pg_catalog.substr(remaining, 1, token_at - 1)
      || case token
        when '\n' then E'\n'
        when '\r' then E'\r'
        when '\t' then E'\t'
        when '\"' then '"'
        when '\\' then '\'
        when '&amp;' then '&'
        when '&lt;' then '<'
        when '&gt;' then '>'
        when '&quot;' then '"'
        when '&#39;' then ''''
      end;

    remaining := pg_catalog.substr(
      remaining,
      token_at + pg_catalog.length(token)
    );
  end loop;

  decoded := decoded || remaining;

  if not retrim then
    return decoded;
  end if;

  -- `job_title` and `company_name` only (AC-4). A decoded escape can put
  -- whitespace at an edge, and the TypeScript side trims again for the same
  -- reason. Where that leaves nothing, the stored value is kept as it was:
  -- writing an empty string would break the columns' own
  -- `length(trim(...)) > 0` checks and fail the whole migration, and the row
  -- then stays visible to the post backfill count rather than silently
  -- altered.
  trimmed := pg_catalog.regexp_replace(decoded, edge_space, '', 'g');

  if trimmed = '' then
    return input;
  end if;

  return trimmed;
end;
$$;

comment on function public.decode_listing_text(text, boolean) is
'Spec 0022 AC-4, AC-7: decodes the ten escape tokens decodeListingText() in src/lib/listing-normalize.ts decodes, in one left to right pass, byte for byte the same (a parity test enforces it). retrim applies JavaScript trim() and keeps the input unchanged when that leaves nothing. Granted to no Data API role.';

revoke execute on function public.decode_listing_text(text, boolean)
  from public, anon, authenticated, service_role;

-- THE BACKFILL, run once. Only rows carrying at least one of the ten tokens in
-- one of the four columns are touched, so every other row is left byte
-- identical, `updated_at` included (AC-7). `job_location` and
-- `job_description` are decoded without the second trim, matching the parse,
-- which never trims those two.
--
-- A ROW MATCHED ONLY THROUGH ANOTHER COLUMN still has its title and company
-- passed through the second trim, and that is a no-op: the insert path
-- already stores both trimmed (`title` and `companyName` are
-- `z.string().trim()` in `src/features/applications/schemas.ts`, the same
-- JavaScript whitespace set `edge_space` mirrors), so a column with no token
-- comes out byte identical.
update public.application
set
  job_title = public.decode_listing_text(job_title, true),
  company_name = public.decode_listing_text(company_name, true),
  job_location = public.decode_listing_text(job_location),
  job_description = public.decode_listing_text(job_description)
where exists (
  select 1
  from pg_catalog.unnest(
    array[job_title, company_name, job_location, job_description]
  ) as field (value)
  where field.value ~ '\\n|\\r|\\t|\\"|\\\\|&amp;|&lt;|&gt;|&quot;|&#39;'
);
