/**
 * The one absolute date format the signed in pages print (spec 0014 AC-18,
 * spec 0024 `COPY-12`, `COPY-16`, `COPY-18`).
 *
 * ONE DEFINITION FOR TWO FEATURES. `/applications` prints when an application
 * was recorded and `/resume` (plus its card on `/profile`) prints when a
 * version was saved, and spec 0024 states that its dates match `/applications`'
 * own. Two copies of the formatter options would be two implementations of one
 * rule that could drift apart silently, so both call this.
 *
 * `en-US`, long month, no time. The time is left out because the server formats
 * it in its own zone, which is not the reader's, and a date is the precision an
 * archive is read at.
 *
 * @returns The formatted date, for example `September 30, 2026`, or `undefined`
 * when the value does not parse. Each caller decides what an unparseable value
 * shows, because an absent date and a raw one mean different things on
 * different pages.
 */
export function formatLongDate(value: string): string | undefined {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return undefined;

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
