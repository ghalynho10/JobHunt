/**
 * Every piece of personal data this app stores, as a typed registry (spec 0009,
 * AC-2, AC-6, AC-23).
 *
 * THE SAME SHAPE AS `recipients.ts`, POINTED AT THE OTHER HALF OF THE NOTICE.
 * A cross check on the spec found the recipient list guarded and the field list
 * not, which is an asymmetry worth naming: a migration that adds a column is a
 * far more ordinary event than a new company, so the unguarded half was the one
 * more likely to go stale.
 *
 * `stored-fields.test.ts` reads `src/lib/supabase/database.types.ts`, which
 * `pnpm db:types` regenerates from the applied schema, and fails when a table
 * here holds a column no entry below names, when an entry names a column that
 * no longer exists, or when a table appears in the schema that neither list
 * classifies. A migration that adds a column the notice does not mention fails
 * the suite rather than quietly making the notice incomplete.
 */

/** One stored column, and the plain words the notice uses for it. */
export interface StoredField {
  /** A table in the generated database types. */
  readonly table: string;
  /** A column in that table. */
  readonly column: string;
  /** The plain words the notice uses for it. */
  readonly describedAs: string;
}

/**
 * A table holding personal data, and the words the notice groups it under.
 *
 * The order here is the order the notice lists them in: who the person is
 * first, then what they told us they want, then what they did with it.
 */
export interface PersonalDataTable {
  readonly table: string;
  /** The heading the notice gives this group. */
  readonly heading: string;
}

/** The tables holding personal data, in the order the notice lists them (AC-2). */
export const PERSONAL_DATA_TABLES: readonly PersonalDataTable[] = [
  { table: "profile", heading: "Your profile" },
  { table: "profile_skill", heading: "Your skills" },
  { table: "work_experience", heading: "Your work history" },
  { table: "job_preference", heading: "What you are looking for" },
  { table: "application", heading: "Jobs you applied to" },
  {
    table: "application_answer",
    heading: "Answers you wrote on an application",
  },
  { table: "usage_gate_counter", heading: "Your job search usage" },
];

/**
 * A table in the schema that holds nothing about any person, and why.
 *
 * Declared rather than assumed, so a NEW table is a suite failure until
 * somebody says which side of the line it falls on. Without this the drift test
 * would only guard the tables it already knew about, which is the guard that
 * misses the case it exists for.
 */
export interface NonPersonalTable {
  readonly table: string;
  readonly why: string;
}

/** Tables holding no personal data (AC-23). */
export const NON_PERSONAL_TABLES: readonly NonPersonalTable[] = [
  {
    table: "app_settings",
    why: "One row of operator settings, holding the global kill switch. It has no person attached to it.",
  },
  {
    table: "usage_cap",
    why: "The usage caps checked before a job search call. These are fixed configuration values, the same for everyone, with no person attached to any row.",
  },
];

/**
 * A field arriving from the identity provider, stored in `auth.users`.
 *
 * KEPT SEPARATE FROM THE LIST BELOW because the drift test cannot see it:
 * `database.types.ts` is generated for the `public` schema alone, and
 * `auth.users` is Supabase's own table. Spec 0007 `index.md:155` is the source
 * for what actually arrives, and this list stays correct by review.
 */
export interface IdentityField {
  readonly describedAs: string;
}

/** What the sign in provider hands over (AC-2). */
export const IDENTITY_FIELDS: readonly IdentityField[] = [
  { describedAs: "your email address" },
  { describedAs: "the display name on that account" },
  { describedAs: "the address of that account's picture" },
];

/**
 * Every column in every personal data table (AC-2, AC-23).
 *
 * INCLUDING THE ONES THAT LOOK LIKE PLUMBING. The row identifiers and the
 * `created_at` and `updated_at` timestamps are listed rather than skipped: when
 * a record was made and last changed is itself personal data, and an identifier
 * that points at a person is what makes every other row here findable.
 */
export const STORED_FIELDS: readonly StoredField[] = [
  // profile
  {
    table: "profile",
    column: "id",
    describedAs: "the identifier linking your profile to your sign in account",
  },
  { table: "profile", column: "full_name", describedAs: "your full name" },
  { table: "profile", column: "location", describedAs: "where you are based" },
  {
    table: "profile",
    column: "summary",
    describedAs: "the summary you wrote about yourself",
  },
  {
    table: "profile",
    column: "created_at",
    describedAs: "when your profile was created",
  },
  {
    table: "profile",
    column: "updated_at",
    describedAs: "when it was last changed",
  },

  // profile_skill
  {
    table: "profile_skill",
    column: "id",
    describedAs: "an identifier for the entry",
  },
  {
    table: "profile_skill",
    column: "profile_id",
    describedAs: "the profile it belongs to",
  },
  {
    table: "profile_skill",
    column: "name",
    describedAs: "the name of each skill you listed",
  },
  {
    table: "profile_skill",
    column: "created_at",
    describedAs: "when you added it",
  },

  // work_experience
  {
    table: "work_experience",
    column: "id",
    describedAs: "an identifier for the entry",
  },
  {
    table: "work_experience",
    column: "profile_id",
    describedAs: "the profile it belongs to",
  },
  {
    table: "work_experience",
    column: "company",
    describedAs: "the company you worked for",
  },
  {
    table: "work_experience",
    column: "title",
    describedAs: "your job title there",
  },
  {
    table: "work_experience",
    column: "location",
    describedAs: "where that job was based",
  },
  {
    table: "work_experience",
    column: "description",
    describedAs: "what you wrote about the role",
  },
  {
    table: "work_experience",
    column: "started_on",
    describedAs: "the month it started",
  },
  {
    table: "work_experience",
    column: "ended_on",
    describedAs: "the month it ended, if it has",
  },
  {
    table: "work_experience",
    column: "created_at",
    describedAs: "when you added it",
  },
  {
    table: "work_experience",
    column: "updated_at",
    describedAs: "when it was last changed",
  },

  // job_preference
  {
    table: "job_preference",
    column: "profile_id",
    describedAs: "the profile these preferences belong to",
  },
  {
    table: "job_preference",
    column: "desired_titles",
    describedAs: "the job titles you are looking for",
  },
  {
    table: "job_preference",
    column: "desired_locations",
    describedAs: "the places you would work in",
  },
  {
    table: "job_preference",
    column: "remote_preference",
    describedAs: "how you feel about remote work",
  },
  {
    table: "job_preference",
    column: "minimum_pay",
    describedAs: "the least you would accept",
  },
  {
    table: "job_preference",
    column: "minimum_pay_currency",
    describedAs: "the currency that figure is in",
  },
  {
    table: "job_preference",
    column: "created_at",
    describedAs: "when you set them",
  },
  {
    table: "job_preference",
    column: "updated_at",
    describedAs: "when you last changed them",
  },

  // application
  {
    table: "application",
    column: "id",
    describedAs: "an identifier for the entry",
  },
  {
    table: "application",
    column: "profile_id",
    describedAs: "the profile it belongs to",
  },
  {
    table: "application",
    column: "source",
    describedAs: "the job board the opening came from",
  },
  {
    table: "application",
    column: "source_job_id",
    describedAs: "that board's own identifier for the opening",
  },
  { table: "application", column: "job_title", describedAs: "the job title" },
  { table: "application", column: "company_name", describedAs: "the company" },
  {
    table: "application",
    column: "job_location",
    describedAs: "where the job is based",
  },
  {
    table: "application",
    column: "job_url",
    describedAs: "the link to the opening",
  },
  {
    table: "application",
    column: "job_description",
    describedAs: "the description of the opening",
  },
  {
    table: "application",
    column: "salary_min",
    describedAs: "the bottom of the advertised pay range",
  },
  { table: "application", column: "salary_max", describedAs: "the top of it" },
  {
    table: "application",
    column: "salary_currency",
    describedAs: "the currency the range is in",
  },
  {
    table: "application",
    column: "posted_at",
    describedAs: "when the opening was posted",
  },
  {
    table: "application",
    column: "applied_at",
    describedAs: "when you applied",
  },
  {
    table: "application",
    column: "created_at",
    describedAs: "when the record was created",
  },
  {
    table: "application",
    column: "updated_at",
    describedAs: "when it was last changed",
  },

  // application_answer
  {
    table: "application_answer",
    column: "id",
    describedAs: "an identifier for the entry",
  },
  {
    table: "application_answer",
    column: "profile_id",
    describedAs: "the profile it belongs to",
  },
  {
    table: "application_answer",
    column: "application_id",
    describedAs: "the application it was written for",
  },
  {
    table: "application_answer",
    column: "question_key",
    describedAs: "which question it answers",
  },
  {
    table: "application_answer",
    column: "answer",
    describedAs: "the answer you typed, in your own words",
  },
  {
    table: "application_answer",
    column: "created_at",
    describedAs: "when you wrote it",
  },
  {
    table: "application_answer",
    column: "updated_at",
    describedAs: "when you last changed it",
  },

  // usage_gate_counter
  {
    table: "usage_gate_counter",
    column: "id",
    describedAs: "an identifier for the entry",
  },
  {
    table: "usage_gate_counter",
    column: "call_type",
    describedAs: "which kind of call this counts (job search today)",
  },
  {
    table: "usage_gate_counter",
    column: "scope",
    describedAs:
      "whether the row counts your own usage or the whole app's shared usage",
  },
  {
    table: "usage_gate_counter",
    column: "profile_id",
    describedAs:
      "your profile, on a row that counts your own usage rather than the whole app's",
  },
  {
    table: "usage_gate_counter",
    column: "period",
    describedAs: "whether the window is a day, a week or a month",
  },
  {
    table: "usage_gate_counter",
    column: "period_start",
    describedAs: "when that window began",
  },
  {
    table: "usage_gate_counter",
    column: "attempt_count",
    describedAs: "how many times this was checked, allowed or not",
  },
  {
    table: "usage_gate_counter",
    column: "consumed_count",
    describedAs: "how many of those checks were actually allowed",
  },
  {
    table: "usage_gate_counter",
    column: "updated_at",
    describedAs: "when it was last changed",
  },
];

/** Every field stored for one table, in registry order. */
export function fieldsFor(table: string): readonly StoredField[] {
  return STORED_FIELDS.filter((field) => field.table === table);
}
