/**
 * Every line break as `\n` (spec 0024, AC-3, AC-7).
 *
 * A BROWSER POSTS A TEXTAREA'S LINE BREAKS AS `\r\n`, and a textarea reports
 * any text it is given back with `\n` only. Text that keeps the `\r` can never
 * equal the field it reopens in, so the editor's unsaved changes check called
 * a saved version unsaved before anyone typed, and every line counted one
 * character the reader could not see against the 20000 ceiling. Found by
 * `/check verify` on 2026-09-30.
 *
 * Applied at the two places text enters the resume: the save parse
 * (`schemas.ts`), so what is stored is what a textarea reads back, and the
 * profile seed (`seed.ts`), because the profile stores its own textareas as
 * posted and those rows already exist.
 *
 * A lone `\r` is converted too, since a textarea normalises it the same way.
 */
export function normalizeLineBreaks(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
