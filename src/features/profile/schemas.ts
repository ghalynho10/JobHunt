import { z } from "zod";

import { EARLIEST_YEAR, isAfter, type CalendarMonth } from "./calendar";

/**
 * The boundary parses for every profile write (spec 0010, AC-3, AC-6, AC-7,
 * AC-7a, AC-9).
 *
 * PARSE AT EVERY BOUNDARY. A Server Action is a callable endpoint whatever page
 * renders it, so the `maxLength` and `required` attributes on the controls are a
 * courtesy to the person typing and never the check. These schemas are.
 *
 * THEY MIRROR THE TABLES' OWN CHECK CONSTRAINTS rather than replacing them.
 * `public.profile`, `public.profile_skill` and `public.work_experience` each
 * carry their limits in the database, and the point of restating them here is
 * that a violation becomes a sentence next to a field instead of a raised
 * constraint error the page has to translate after the fact. Where a limit has
 * no database twin it is marked as such below.
 *
 * OPTIONAL TEXT BECOMES `undefined`, NEVER `""` (invariant 8). The write maps
 * that to `NULL`, so "is this set" stays a question the database can answer.
 */

/**
 * An optional free text field: trimmed, capped, and absent when it trims to
 * nothing.
 *
 * @param max The character cap, applied to the trimmed value.
 * @param message What the reader sees when it is over the cap.
 */
function optionalText(max: number, message: string) {
  return z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => (value === "" ? undefined : value));
}

/** A required free text field: trimmed, non blank, and capped. */
function requiredText(max: number, blank: string, tooLong: string) {
  return z.string().trim().min(1, blank).max(max, tooLong);
}

/**
 * A newline separated list, cleaned the way the unique index expects.
 *
 * ONE VALUE PER LINE, NEVER COMMA SEPARATED (AC-9). A desired location can
 * itself contain a comma ("Berlin, Germany"), and a separator that appears
 * inside the values is a parser that quietly loses data.
 *
 * THE ORDER OF THE STEPS IS THE SPEC'S: trim, drop empties, deduplicate
 * ignoring case, then check the per value cap and the count. Deduplicating
 * before counting is what makes a list of fifty one entries where two differ
 * only in capitalisation a list of fifty, rather than a rejection the reader
 * cannot see the cause of.
 *
 * FIRST OCCURRENCE WINS ON CASE. `React` typed above `react` keeps `React`,
 * which matches AC-5's rule that a change of capitalisation alone is a no-op
 * and the stored casing stands.
 */
function newlineList(options: {
  readonly maxLength: number;
  readonly tooLong: string;
  readonly maxCount?: number;
  readonly tooMany?: string;
}) {
  return z
    .string()
    .transform((raw) => {
      const seen = new Set<string>();
      const values: string[] = [];

      for (const line of raw.split(/\r?\n/)) {
        const value = line.trim();

        if (value === "") continue;

        const key = value.toLowerCase();

        if (seen.has(key)) continue;

        seen.add(key);
        values.push(value);
      }

      return values as readonly string[];
    })
    .superRefine((values, ctx) => {
      if (values.some((value) => value.length > options.maxLength)) {
        ctx.addIssue({ code: "custom", message: options.tooLong });
      }

      if (
        options.maxCount !== undefined &&
        options.tooMany !== undefined &&
        values.length > options.maxCount
      ) {
        ctx.addIssue({ code: "custom", message: options.tooMany });
      }
    });
}

/**
 * Identity (AC-3).
 *
 * `location` CARRIES A 200 CHARACTER CAP THAT AC-3 DOES NOT STATE, and that is
 * worth flagging rather than burying. `public.profile.location` has no check
 * constraint of its own, and AC-3 names caps for `full_name` and `summary` only.
 * The cap here is the same application only choice AC-7a makes explicitly for
 * `work_experience.location`, for the same reason (match `full_name`), so the
 * two location fields do not behave differently for no reason. It is an
 * assumption this build made, not a rule the spec settled.
 */
export const identitySchema = z.object({
  full_name: requiredText(
    200,
    "Enter your name.",
    "Keep your name to 200 characters or fewer.",
  ),
  location: optionalText(200, "Keep the location to 200 characters or fewer."),
  summary: optionalText(4000, "Keep the summary to 4000 characters or fewer."),
});

export type IdentityInput = z.output<typeof identitySchema>;

/**
 * Skills (AC-5, AC-6).
 *
 * The 100 character cap is `public.profile_skill`'s own check constraint, and
 * the deduplication matches its unique index on `(profile_id, lower(name))`, so
 * a name reaching the write has already passed what the index enforces.
 *
 * NO COUNT CAP, deliberately. Neither the schema nor spec 0010 states one, and
 * inventing a ceiling on how many skills a person may claim would be this build
 * deciding a product rule.
 */
export const skillsSchema = z.object({
  skills: newlineList({
    maxLength: 100,
    tooLong: "Keep each skill to 100 characters or fewer.",
  }),
});

/** The four values `public.job_preference`'s check constraint allows (AC-9). */
export const REMOTE_PREFERENCES = [
  "on_site",
  "hybrid",
  "remote",
  "no_preference",
] as const;

export type RemotePreference = (typeof REMOTE_PREFERENCES)[number];

/**
 * The pay amount, as characters rather than as a number (AC-9).
 *
 * REJECTED, NEVER ROUNDED, which is why this is a pattern and not
 * `z.coerce.number()`. Coercing would accept `1234.567` and then silently store
 * `1234.57`, turning a typo into a figure the user never wrote. Ten integer
 * digits and at most two decimals is exactly `numeric(12, 2)`, so the pattern
 * and the column agree by construction.
 */
const PAY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

/**
 * Search preferences (AC-9, AC-10).
 *
 * `minimum_pay` and `minimum_pay_currency` are checked as a PAIR after both are
 * parsed, mirroring `job_preference_pay_paired`, so nothing downstream can ever
 * render a bare number as money. An empty amount is treated as absent before
 * that check runs, never as zero: zero is a real amount somebody could mean.
 */
export const preferencesSchema = z
  .object({
    desired_titles: newlineList({
      maxLength: 100,
      tooLong: "Keep each title to 100 characters or fewer.",
      maxCount: 50,
      tooMany: "Add at most 50 titles.",
    }),
    desired_locations: newlineList({
      maxLength: 100,
      tooLong: "Keep each location to 100 characters or fewer.",
      maxCount: 50,
      tooMany: "Add at most 50 locations.",
    }),
    remote_preference: z.enum(REMOTE_PREFERENCES, {
      error: "Choose one of the four options.",
    }),
    minimum_pay: z
      .string()
      .trim()
      .transform((value) => (value === "" ? undefined : value))
      .refine(
        (value) => value === undefined || PAY_PATTERN.test(value),
        "Enter an amount in digits, with at most two decimal places.",
      ),
    /**
     * TRIMMED AND UPPERCASED BEFORE CHECKING, so `eur` is accepted and stored as
     * `EUR`, which is what the column's `^[A-Z]{3}$` check will take.
     *
     * NO FIXED CURRENCY LIST. The schema has none, and a list here would be a
     * second source of truth that starts out agreeing and stops.
     */
    minimum_pay_currency: z
      .string()
      .trim()
      .toUpperCase()
      .transform((value) => (value === "" ? undefined : value))
      .refine(
        (value) => value === undefined || /^[A-Z]{3}$/.test(value),
        "Use a three letter currency code, for example EUR.",
      ),
  })
  .superRefine((values, ctx) => {
    if (
      values.minimum_pay !== undefined &&
      values.minimum_pay_currency === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["minimum_pay_currency"],
        message: "Add the currency this amount is in.",
      });
    }

    if (
      values.minimum_pay === undefined &&
      values.minimum_pay_currency !== undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["minimum_pay"],
        message: "Add the amount this currency goes with.",
      });
    }
  });

export type PreferencesInput = z.output<typeof preferencesSchema>;

/** A month or year select, parsed back to the number it submitted. */
function selectedNumber(missing: string) {
  return z
    .string()
    .trim()
    .min(1, missing)
    .refine((value) => /^\d+$/.test(value), missing)
    .transform((value) => Number(value));
}

/** The same, for a select the form accepts unset. */
function optionalSelectedNumber(invalid: string) {
  return z
    .string()
    .trim()
    .transform((value) => (value === "" ? undefined : value))
    .refine((value) => value === undefined || /^\d+$/.test(value), invalid)
    .transform((value) => (value === undefined ? undefined : Number(value)));
}

/**
 * A work history entry (AC-7, AC-7a).
 *
 * THE DATE RULES NEED TO KNOW WHAT MONTH IT IS, so this is a function of the
 * current month rather than a constant schema. The month is passed in rather
 * than read from a clock inside the rules, which is what lets a test drive the
 * "not in the future" rule at a chosen month instead of only at whatever month
 * the test happens to run in.
 *
 * `location`'s 200 character cap is an APPLICATION ONLY limit (AC-7a says so in
 * terms): `work_experience.location` carries no database check, and the cap
 * matches `company` and `title` so the three read alike.
 *
 * @param today The month every "not in the future" check is judged against.
 */
export function workExperienceSchema(today: CalendarMonth) {
  return z
    .object({
      company: requiredText(
        200,
        "Enter the company.",
        "Keep the company to 200 characters or fewer.",
      ),
      title: requiredText(
        200,
        "Enter the job title.",
        "Keep the job title to 200 characters or fewer.",
      ),
      location: optionalText(
        200,
        "Keep the location to 200 characters or fewer.",
      ),
      description: optionalText(
        4000,
        "Keep the description to 4000 characters or fewer.",
      ),
      started_month: selectedNumber("Choose the month this role started."),
      started_year: selectedNumber("Choose the year this role started."),
      ended_month: optionalSelectedNumber("Choose a month, or leave it unset."),
      ended_year: optionalSelectedNumber("Choose a year, or leave it unset."),
    })
    .superRefine((values, ctx) => {
      if (values.started_month < 1 || values.started_month > 12) {
        ctx.addIssue({
          code: "custom",
          path: ["started_month"],
          message: "Choose one of the twelve months.",
        });
      }

      if (
        values.started_year < EARLIEST_YEAR ||
        values.started_year > today.year
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["started_year"],
          message: `Choose a year between ${EARLIEST_YEAR} and ${today.year}.`,
        });
      }

      const started = {
        year: values.started_year,
        month: values.started_month,
      };

      /** AC-7: a role never starts in a month that has not arrived. */
      if (isAfter(started, today)) {
        ctx.addIssue({
          code: "custom",
          path: ["started_month"],
          message: "A role cannot start in the future.",
        });
      }

      /**
       * AC-7: both ended values or neither. An absent pair means the role is
       * current, which is why there is no separate "current role" control: two
       * ways of saying the same thing can disagree.
       */
      if (values.ended_month !== undefined && values.ended_year === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["ended_year"],
          message: "Add the year this role ended, or clear the month.",
        });
        return;
      }

      if (values.ended_month === undefined && values.ended_year !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["ended_month"],
          message: "Add the month this role ended, or clear the year.",
        });
        return;
      }

      if (values.ended_month === undefined || values.ended_year === undefined) {
        return;
      }

      if (values.ended_month < 1 || values.ended_month > 12) {
        ctx.addIssue({
          code: "custom",
          path: ["ended_month"],
          message: "Choose one of the twelve months.",
        });
        return;
      }

      if (values.ended_year < EARLIEST_YEAR || values.ended_year > today.year) {
        ctx.addIssue({
          code: "custom",
          path: ["ended_year"],
          message: `Choose a year between ${EARLIEST_YEAR} and ${today.year}.`,
        });
        return;
      }

      const ended = { year: values.ended_year, month: values.ended_month };

      /** Invariant 7, and `work_experience_period_ordered` in the schema. */
      if (isAfter(started, ended)) {
        ctx.addIssue({
          code: "custom",
          path: ["ended_month"],
          message: "This role cannot end before it started.",
        });
      }
    });
}

export type WorkExperienceInput = z.output<
  ReturnType<typeof workExperienceSchema>
>;

/**
 * A work history entry id, arriving on the query string or in a delete form.
 *
 * `z.uuid()` RATHER THAN `z.guid()`, matching the tightening spec 0004 made to
 * `readOwnProfile()`: the version and variant nibbles are checked, so a
 * malformed id is refused at the boundary rather than sent to Postgres to
 * refuse. A refusal here renders the plain view with the "no longer there" line
 * (AC-13), which is the same outcome a stale but well formed id gets, on
 * purpose.
 */
export const entryIdSchema = z.uuid();
