import { z } from "zod";

import { ADZUNA_SOURCE } from "@/lib/adzuna";

/**
 * The listing as it arrives at `recordApplication` (spec 0014, AC-2).
 *
 * WHY A SECOND SCHEMA EXISTS AT ALL. `adzunaItemSchema` in the search feature
 * parses Adzuna's WIRE shape (`company.display_name`, `salary_is_predicted` as
 * a literal `0`/`1`) and transforms it. `Listing` is that schema's OUTPUT, so
 * it cannot be reused to parse a `Listing` back: nothing in the app parses the
 * transformed shape until this file. Skipping it and trusting the value would
 * break `AGENTS.md`'s "Parse at every boundary" rule, and the closure crossing
 * to the browser and back is unmistakably a boundary.
 *
 * THE ENCRYPTION IS NOT THE BOUNDARY. Next encrypts the variables an inline
 * action closes over with a per build key, so a client cannot forge one
 * (`node_modules/next/dist/docs/01-app/02-guides/data-security.md:526`). The
 * same page at line 528 says not to rely on that alone, and it does not stop a
 * client replaying a listing it WAS served. Replay is harmless here, since row
 * level security confines the write to the caller's own rows, but "harmless
 * given one other guarantee" is the reasoning that rots.
 *
 * EVERY FIELD IS TIGHTER THAN THE COLUMN IT LANDS IN, on purpose. The database
 * is the real guarantee (spec 0003, invariant 4); this schema exists so a bad
 * value becomes a visible expected failure here instead of a raw driver error
 * there.
 */
export const listingSnapshotSchema = z
  .object({
    /**
     * The one literal `application.source` accepts today, so a drifted value
     * is refused here rather than by the column's check constraint.
     */
    source: z.literal(ADZUNA_SOURCE),
    /**
     * These four land in columns carrying `check (length(trim(...)) > 0)`.
     * Feature 11's parse already refuses an empty value (spec 0014, AC-13), so
     * this is the second of two gates rather than the only one.
     */
    sourceJobId: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(500),
    companyName: z.string().trim().min(1).max(500),
    url: z.url({ protocol: /^https?$/ }).max(2000),
    location: z.string().trim().min(1).max(500).optional(),
    descriptionSnippet: z.string().max(20_000).optional(),
    salaryMin: z.number().finite().nonnegative().optional(),
    salaryMax: z.number().finite().nonnegative().optional(),
    /** Three uppercase letters, matching the column's own pattern check. */
    salaryCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    salaryIsPredicted: z.boolean(),
    /**
     * A REAL ISO DATETIME, NOT ANY STRING, and this is the one field where the
     * schema is doing work nothing else does. Feature 11 accepts Adzuna's
     * `created` as a plain `z.string()`, so an advert carrying "last Tuesday"
     * parses, renders as no date at all (the formatter returns `undefined`),
     * and then reaches `posted_at timestamptz` where Postgres raises `22007`.
     * That code is in none of this feature's mappings, so it would surface as
     * `database_unavailable`: a data quality problem reported to the reader and
     * to Sentry as an outage. Refusing it here makes it `validation_failed`,
     * which is what it is.
     */
    postedAt: z.iso.datetime({ offset: true }).optional(),
  })
  /**
   * The two pairing rules the table enforces, checked here so a violation is a
   * visible expected failure rather than a `23514` from the driver.
   */
  .refine(
    (listing) =>
      (listing.salaryMin === undefined && listing.salaryMax === undefined) ===
      (listing.salaryCurrency === undefined),
    {
      message:
        "A pay figure and its currency are present together or not at all.",
    },
  )
  .refine(
    (listing) =>
      listing.salaryMin === undefined ||
      listing.salaryMax === undefined ||
      listing.salaryMax >= listing.salaryMin,
    { message: "A pay range cannot have its top below its bottom." },
  );

/** The listing shape `recordApplication` accepts, after parsing. */
export type ListingSnapshot = z.infer<typeof listingSnapshotSchema>;

/**
 * The value `application.salary_is_predicted` is written (spec 0014, AC-6).
 *
 * NULL RATHER THAN `false` WHEN NO PAY WAS STATED, and the whole column exists
 * for this distinction. Adzuna sends `salary_is_predicted` on every advert,
 * including ones quoting no pay, so passing the boolean straight through would
 * stamp `false` on rows with no salary. `false` there reads as "this figure was
 * stated rather than predicted", which is a claim about a figure that does not
 * exist. The database refuses the mistake either way
 * (`application_predicted_pairing`), so this function is what keeps the refusal
 * from ever being reached.
 */
export function predictedFlagFor(listing: ListingSnapshot): boolean | null {
  const hasSalary =
    listing.salaryMin !== undefined || listing.salaryMax !== undefined;

  return hasSalary ? listing.salaryIsPredicted : null;
}
