import { z } from "zod";

import { BLANK_CONTENT, tooLongContent } from "./copy";
import { normalizeLineBreaks } from "./line-breaks";
import { RESUME_MAX_LENGTH } from "./limits";

/**
 * The boundary parses for the resume feature (spec 0024, AC-3, AC-8, AC-9).
 *
 * The database checks the same rules again (`resume_version`'s own `check`s),
 * because a Server Action is a callable endpoint whatever page renders it and
 * the database is the one thing no caller can skip.
 */

/**
 * The largest `previousVersionNumber` that still leaves room for `+ 1` in a
 * Postgres `integer`. Past it the insert would fail with a numeric overflow,
 * which is a malformed submission, not a database outage, so it is refused here.
 */
const MAX_PREVIOUS_VERSION = 2_147_483_646;

/**
 * What a save submits (AC-3, AC-9).
 *
 * LINE BREAKS ARE NORMALISED FIRST (`line-breaks.ts`), before either check, so
 * the blank and length rules judge the text the reader sees and the stored
 * text is what a textarea reports when it is read back (AC-7).
 *
 * THE BLANK CHECK TRIMS, and it runs before the length check, so a reader who
 * submits only spaces meets `COPY-10` rather than a length message. JavaScript's
 * `trim()` removes every kind of whitespace, which is stricter than Postgres's
 * space only `btrim`, so nothing this passes can fail the database's own check.
 *
 * THE LENGTH IS `string.length`, UTF-16 code units, the same unit a textarea's
 * `maxLength` counts. Postgres's `char_length` counts code points, so a string
 * at the limit here is at or under it there: again the parse is the stricter of
 * the two, never the looser.
 *
 * `previousVersionNumber` IS A NON NEGATIVE INTEGER WRITTEN IN DIGITS ONLY. `0`
 * is the first save (no version exists yet). Anything else is `COPY-33`'s case,
 * never a raw database error.
 */
export const saveResumeSchema = z.object({
  content: z
    .string()
    .transform(normalizeLineBreaks)
    .refine((value) => value.trim().length > 0, { message: BLANK_CONTENT })
    .refine((value) => value.length <= RESUME_MAX_LENGTH, {
      message: tooLongContent(RESUME_MAX_LENGTH),
    }),
  previousVersionNumber: z
    .string()
    .regex(/^\d{1,10}$/)
    .transform(Number)
    .pipe(z.number().int().min(0).max(MAX_PREVIOUS_VERSION)),
});

/** A version id named by `from`, which must be a uuid before it is queried. */
export const versionIdSchema = z.uuid();
