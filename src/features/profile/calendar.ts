import type { SelectOption } from "@/components/ui/select";

/**
 * The month and year values a work history entry is built from (spec 0010,
 * AC-7).
 *
 * A WORK HISTORY DATE IS NEVER TYPED AND NEVER PARSED FROM FREE TEXT. The form
 * offers a month and a year, each a closed choice, and the action builds the
 * first day of that month from the two (invariant 3). `work_experience` pins
 * the day to 1 with its own check constraint, because nobody states an
 * employment history to the day and storing a real day would invent precision
 * the user never gave.
 *
 * THE MONTH NAMES ARE ORDINARY CALENDAR NAMES, FIXED BY SPEC 0010, and they are
 * deliberately NOT a `COPY-` slot. They are not product voice, so they are not
 * the engineer's to write and not this file's to reword either.
 *
 * They are also not derived from `Intl.DateTimeFormat`, which would make the
 * option labels depend on the server's locale and on the ICU data in whatever
 * Node build is running. That would be a value with no stable source, rendering
 * one set of names locally and another on the deployed runtime.
 */

/** January to December, in order. The index plus one is the submitted value. */
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * The twelve months as `Select` options, submitted as the values `1` to `12`.
 *
 * The value is the calendar month number rather than the array index, so what
 * arrives at the action is the number Postgres wants and no call site has to
 * remember to add one.
 */
export const MONTH_OPTIONS: readonly SelectOption[] = MONTH_NAMES.map(
  (label, index) => ({ value: String(index + 1), label }),
);

/**
 * The earliest year a work history entry may start in (spec 0010, AC-7).
 *
 * A floor rather than an open field: it bounds the control, and the same bound
 * is re-checked in the action, because a Server Action is a callable endpoint
 * whatever page renders it.
 */
export const EARLIEST_YEAR = 1950;

/**
 * The month a date is being judged against, as a plain year and month.
 *
 * PASSED IN, NEVER READ FROM A CLOCK INSIDE THE VALIDATOR. The parse rules below
 * are pure, which is what lets a test drive them at a chosen month instead of
 * only at whatever month the test happens to run in.
 */
export interface CalendarMonth {
  readonly year: number;
  /** 1 to 12, the same numbering the options submit. */
  readonly month: number;
}

/**
 * The current month, from the server's own clock.
 *
 * THE ONE PLACE THE CLOCK IS READ for this feature, so everything downstream is
 * a pure function of the value it returns. It is UTC rather than a per user
 * zone, and that is a real choice: a work history bound is a coarse "not in the
 * future" rule on a month, and the widest a UTC reading can be wrong is the one
 * day either side of a month boundary, on which it errs by accepting a month the
 * user has effectively already reached. Storing a zone per user to sharpen that
 * would be a data model change, which spec 0010 explicitly adds none of.
 */
export function currentMonth(): CalendarMonth {
  const now = new Date();

  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

/**
 * The years a work history entry may name, newest first (spec 0010, AC-7).
 *
 * BOUNDED AT THE CURRENT YEAR, NO LATER. A role never starts or ends in the
 * future, so a year that has not happened is not offered at all, rather than
 * offered and then refused on submit.
 *
 * Newest first because a work history is nearly always recent: the years a
 * reader wants are at the top of the list, not eighty options down.
 *
 * @param upTo The latest year to offer. Callers pass `currentMonth().year`.
 */
export function yearOptions(upTo: number): readonly SelectOption[] {
  const years: SelectOption[] = [];

  for (let year = upTo; year >= EARLIEST_YEAR; year -= 1) {
    years.push({ value: String(year), label: String(year) });
  }

  return years;
}

/**
 * A month and year as the first day of that month, in the `YYYY-MM-DD` shape
 * Postgres `date` accepts.
 *
 * A STRING, NOT A `Date`. A `Date` would carry a time and a zone the user never
 * gave, and converting it back to a date at the driver would put the stored day
 * one either side of the first depending on where the server is. Formatting the
 * three numbers directly means the day is 1 by construction, which is what the
 * table's own check constraint enforces.
 */
export function firstOfMonth({ year, month }: CalendarMonth): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

/**
 * A stored `YYYY-MM-DD` date back as a month and year, for rendering it into
 * the edit form's two selects.
 *
 * It reads the string rather than constructing a `Date`, for the same reason
 * `firstOfMonth` writes one: `new Date("2019-03-01")` is parsed as UTC midnight
 * and then read back in the server's own zone, which lands on February in every
 * zone behind UTC. The date is three numbers separated by dashes and nothing
 * about it needs a calendar to read.
 *
 * @returns The month, or `undefined` when the string is not the shape a
 * Postgres `date` column returns. `undefined` renders as an unset pair rather
 * than as a guess.
 */
export function monthOf(stored: string): CalendarMonth | undefined {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(stored);

  if (match === null) return undefined;

  const [, year, month] = match;

  /**
   * `noUncheckedIndexedAccess` makes both possibly undefined even though the
   * pattern guarantees them. Checking is cheaper than asserting, and an
   * assertion here is exactly the kind the compiler cannot catch being wrong.
   */
  if (year === undefined || month === undefined) return undefined;

  return { year: Number(year), month: Number(month) };
}

/**
 * A stored date as the label a reader sees, for example `March 2019`.
 *
 * Values are stored raw and formatted at render, per `AGENTS.md`. This is that
 * render, and it is the only place a work history date becomes words.
 */
export function formatMonth(stored: string): string {
  const parsed = monthOf(stored);

  /**
   * NO SILENT FALLBACK TO SOMETHING THAT LOOKS FINE. A date that did not parse
   * is shown as it is stored, so an unexpected shape is visible on the page
   * rather than rendered as a plausible month nobody chose.
   */
  if (parsed === undefined) return stored;

  const name = MONTH_NAMES[parsed.month - 1];

  if (name === undefined) return stored;

  return `${name} ${parsed.year}`;
}

/**
 * Whether `candidate` falls after `limit`, comparing year then month.
 *
 * One function so the "not in the future" check and the "ended after started"
 * check cannot disagree about what later means (spec 0010, AC-7).
 */
export function isAfter(
  candidate: CalendarMonth,
  limit: CalendarMonth,
): boolean {
  if (candidate.year !== limit.year) return candidate.year > limit.year;

  return candidate.month > limit.month;
}
