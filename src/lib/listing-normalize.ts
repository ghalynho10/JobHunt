import * as Sentry from "@sentry/nextjs";

/**
 * Decoding the escaped text Adzuna sends (spec 0022, AC-4, AC-5).
 *
 * WHY THIS RUNS AT THE PARSE BOUNDARY, NOT AT RENDER. `AGENTS.md` says store
 * raw and format at render, and this is a deliberate, narrow exception to it
 * (spec 0022, Consequences). Applying copies a listing onto an `application`
 * row, so a render time fix would leave every stored snapshot printing a
 * literal `\n` for as long as the row exists. Decoded once here, every consumer
 * (render, storage, scoring) receives the same clean text, and nothing
 * downstream decodes it a second time (invariant 3).
 *
 * THE SQL TWIN. `public.decode_listing_text` in
 * `supabase/migrations/20260921120000_decode_listing_text.sql` applies this
 * exact rule to rows already stored. A parity test runs both over
 * `test/fixtures/decode-cases.ts` (invariant 4). Change the token set here and
 * that function has to change in a new migration, or the parity test fails.
 */

/**
 * The ten tokens AC-4 decodes, and what each one becomes.
 *
 * EXACTLY FIVE ENTITIES, deliberately. A wider set raises the chance of over
 * correcting a posting whose text meant the entity literally (spec 0022,
 * Migration plan, Risks). Anything outside this map is reported instead.
 */
const DECODED: Readonly<Record<string, string>> = {
  "\\n": "\n",
  "\\r": "\r",
  "\\t": "\t",
  '\\"': '"',
  "\\\\": "\\",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

/**
 * ONE REGULAR EXPRESSION, ONE PASS, LEFT TO RIGHT (AC-4). That is what stops a
 * double decode: `\\n` (backslash, backslash, `n`) matches `\\` first and
 * becomes one backslash followed by a plain `n`, and `&amp;lt;` matches `&amp;`
 * and becomes `&lt;`. Neither result is scanned again. Chaining ten separate
 * `replaceAll` calls would decode both a second time, which is the defect
 * this shape exists to rule out.
 *
 * No two tokens can match at the same position, so the alternation order does
 * not change the result, which is also what lets Postgres's longest match
 * regex engine agree with JavaScript's first match one in the SQL twin.
 */
const TOKEN = /\\n|\\r|\\t|\\"|\\\\|&amp;|&lt;|&gt;|&quot;|&#39;/g;

/**
 * What AC-5 counts as left over, scanned over the DECODED text: a backslash
 * followed by anything outside the five it knows, or something shaped like an
 * entity that is not one of the five named ones. An ordinary `&` in running
 * text and a lone trailing backslash match neither, so neither is reported.
 */
const LEFTOVER =
  /\\[^nrt"\\]|&(?!(?:amp|lt|gt|quot|#39);)(?:[a-zA-Z]+|#[0-9]+|#x[0-9a-fA-F]+);/g;

/**
 * FIXED TEXT, so Sentry groups every repeat into one issue rather than opening
 * a new one per listing (AC-5). The varying parts travel as context.
 */
const LEFTOVER_MESSAGE =
  "Listing text carries an escape this app does not decode";

/** Which listing field a decode is for, carried into the Sentry context. */
export type ListingTextField =
  "title" | "companyName" | "location" | "description";

/** Where a decoded value came from, so a report can name the listing. */
export interface ListingTextContext {
  readonly sourceJobId: string;
  readonly field: ListingTextField;
}

/**
 * Decodes AC-4's escape set in a single pass and reports anything left over.
 *
 * NEVER FAILS AND NEVER DROPS. A leftover fragment is reported through
 * `Sentry.captureMessage` at warning level and the text is returned with the
 * fragment intact (AC-5), because an unfamiliar escape is Adzuna's data
 * quality, not a reason to hide a real listing. It is not a `failure()`: the
 * operation succeeded, and the report exists so the token set can grow from
 * real cases rather than guesses.
 *
 * One report per field, listing every distinct fragment, rather than one per
 * fragment, so a description with thirty of the same escape costs one event.
 *
 * Does not trim. The caller trims where a trimmed value is required, which is
 * `title` and `companyName` in `src/features/search/adzuna.ts`.
 */
export function decodeListingText(
  raw: string,
  context: ListingTextContext,
): string {
  const decoded = raw.replace(TOKEN, (token) => DECODED[token] ?? token);
  const fragments = [...new Set(decoded.match(LEFTOVER) ?? [])];

  if (fragments.length > 0) {
    Sentry.captureMessage(LEFTOVER_MESSAGE, {
      level: "warning",
      fingerprint: [LEFTOVER_MESSAGE],
      tags: { "listing.field": context.field },
      extra: {
        sourceJobId: context.sourceJobId,
        field: context.field,
        fragments,
      },
    });
  }

  return decoded;
}
