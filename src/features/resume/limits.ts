/**
 * The one numeric limit the resume editor, its Zod schema and its copy share
 * (spec 0024, AC-3, `## Copy`).
 *
 * THIS FILE MUST STAY IMPORT FREE, the same rule `src/features/profile/limits.ts`
 * states for the same reason: the editor is a client component, and importing
 * the server side schema to reach one integer would pull `zod` into the client
 * bundle. The migration's `char_length(content) <= 20000` check is the database
 * copy of this number; the two are kept equal by hand, and a mismatch shows up
 * as the 23514 backstop in `saveResumeVersion()` firing.
 */

/** The most characters one resume version may hold. */
export const RESUME_MAX_LENGTH = 20000;
