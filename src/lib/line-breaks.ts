/**
 * Every line break as `\n` (spec 0024, AC-3, AC-7; spec 0025, AC-5, AC-7).
 *
 * A BROWSER POSTS A TEXTAREA'S LINE BREAKS AS `\r\n`, and a textarea reports
 * any text it is given back with `\n` only. Text that keeps the `\r` can never
 * equal the field it reopens in, and every line counts one character the
 * reader cannot see against whatever ceiling the field has. Found on the
 * resume by `/check verify` on 2026-09-30, and on the profile the same day.
 *
 * SHARED BY TWO FEATURES, which is why it lives in `src/lib` (root AGENTS.md,
 * folder by feature). The resume applies it at its save parse and its profile
 * seed; the profile applies it to `summary` and `description` through
 * `multilineText()` in `src/features/profile/schemas.ts`.
 *
 * HAS A SQL TWIN. `public.normalize_line_breaks(text)` applies the same rule
 * for spec 0025's backfill, and `test/integration/normalize-line-breaks.test.ts`
 * runs both over `test/fixtures/line-break-cases.ts` and fails if they ever
 * disagree (spec 0025, invariant 1). Change the rule here and that function
 * has to change in a new migration too.
 *
 * A lone `\r` is converted too, since a textarea normalises it the same way.
 */
export function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
