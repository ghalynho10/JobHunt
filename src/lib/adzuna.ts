/**
 * The Adzuna constants two features share (spec 0014, `## Feature design`).
 *
 * WHY THESE LEFT `src/features/search/`. Feature 11 owned them alone until
 * feature 12 gave `/applications` real listings to display: the source literal
 * every application row carries, and the two attribution link targets Adzuna's
 * terms fix. `AGENTS.md`'s folder rule sends anything two features share to
 * `src/lib` or `src/components`, and it matters more than tidiness here. The
 * attribution components now live in `src/components/`, so leaving these in the
 * search feature would have made a shared component import from one feature to
 * be rendered by another.
 *
 * WHAT DELIBERATELY STAYED BEHIND. `CURRENCY_BY_COUNTRY`, the request shape,
 * every Zod schema and `searchListings()` itself are search's own and are not
 * shared, so they remain in `src/features/search/adzuna.ts`. This module is the
 * shared surface, not a second home for the integration.
 *
 * None of these is an environment variable: they carry no secret and do not
 * vary by deploy environment (spec 0013, `## Feature design`).
 */

/**
 * The one country this app searches, as a plain constant.
 *
 * Widening to more than one market is a code change until a second market is
 * actually needed (spec 0013, Consequences). It lives here rather than in the
 * search feature because the attribution URL below derives from it.
 */
export const ADZUNA_COUNTRY = "us" as const;

/**
 * The main attribution's link target, per Adzuna's terms allowing "the
 * relevant local domain" (spec 0013, AC-6).
 *
 * The map is private on purpose. `ADZUNA_ATTRIBUTION_URL` is the export to
 * import; reaching for the map instead would let a caller pick a country this
 * app is not configured for.
 */
const ATTRIBUTION_DOMAIN_BY_COUNTRY: Readonly<
  Record<typeof ADZUNA_COUNTRY, string>
> = {
  us: "https://www.adzuna.com",
};

/** The "Jobs by Adzuna" attribution link target for the configured country. */
export const ADZUNA_ATTRIBUTION_URL =
  ATTRIBUTION_DOMAIN_BY_COUNTRY[ADZUNA_COUNTRY];

/**
 * The Jobsworth salary attribution's link target, quoted verbatim from
 * Adzuna's terms (spec 0013, AC-7).
 *
 * Unlike the main attribution clause, the terms offer no "or relevant local
 * domain" alternative here, so this is fixed rather than derived from
 * `ADZUNA_COUNTRY` (spec 0013, Follow-up).
 */
export const ADZUNA_JOBSWORTH_URL =
  "http://www.adzuna.co.uk/jobs/salary-predictor.html";

/**
 * The literal every displayed listing and every stored application carries as
 * its source.
 *
 * Exported once so feature 12 writes the same value feature 11 reads, rather
 * than re-declaring the string (spec 0003's Value sourcing table, and spec
 * 0014 AC-2). `application.source` carries `check (source in ('adzuna'))`, so a
 * second hand typed copy that drifted would be refused by the database.
 */
export const ADZUNA_SOURCE = "adzuna" as const;
