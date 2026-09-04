import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { CookieMethodsServer } from "@supabase/ssr";
import { z } from "zod";

import { env } from "@/env";
import {
  attempt,
  failure,
  isFailure,
  success,
  type Result,
} from "@/lib/result";
import type { UsageGateReason } from "@/lib/usage-gating/gate";
import { withUsageGate } from "@/lib/usage-gating/with-usage-gate";

/**
 * Adzuna search (spec 0013). The one place this app calls out to the job
 * board, and the one place its response is parsed rather than trusted.
 */

/**
 * The configured country (spec 0013, Feature design). A code constant, not an
 * environment variable, since it carries no secret and does not vary by
 * deploy environment. Widening this to more than one country is a code
 * change until a second market is actually needed (Consequences).
 */
export const ADZUNA_COUNTRY = "us" as const;

/** Never read from Adzuna, whose response carries no currency field at all. */
const CURRENCY_BY_COUNTRY: Readonly<Record<typeof ADZUNA_COUNTRY, string>> = {
  us: "USD",
};

/**
 * The main attribution's link target, per Adzuna's terms allowing "the
 * relevant local domain" (AC-6).
 */
const ATTRIBUTION_DOMAIN_BY_COUNTRY: Readonly<
  Record<typeof ADZUNA_COUNTRY, string>
> = {
  us: "https://www.adzuna.com",
};

/** The main "Jobs by Adzuna" attribution link target for the configured country. */
export const ADZUNA_ATTRIBUTION_URL =
  ATTRIBUTION_DOMAIN_BY_COUNTRY[ADZUNA_COUNTRY];

/**
 * The Jobsworth salary attribution's link target, quoted verbatim from
 * Adzuna's terms (AC-7). Unlike the main attribution clause, the terms offer
 * no "or relevant local domain" alternative here, so this is fixed rather
 * than derived from `ADZUNA_COUNTRY` (Follow-up).
 */
export const ADZUNA_JOBSWORTH_URL =
  "http://www.adzuna.co.uk/jobs/salary-predictor.html";

/**
 * The literal every displayed listing carries as its source, exported once so
 * feature 12 imports the same value rather than re-declaring it (spec 0003's
 * Value sourcing table names this feature as the one that sets it).
 */
export const ADZUNA_SOURCE = "adzuna" as const;

const RESULTS_PER_PAGE = 20;
const REQUEST_TIMEOUT_MS = 8000;

/**
 * At least one of `title`/`location` is required (AC-2); an empty or
 * whitespace only string counts as absent, not as a value to send Adzuna.
 */
const trimmedQueryField = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((value) =>
    value === undefined || value === "" ? undefined : value,
  );

const searchQuerySchema = z
  .object({
    title: trimmedQueryField,
    location: trimmedQueryField,
  })
  .refine(
    (value) => value.title !== undefined || value.location !== undefined,
    { message: "At least one of title or location is required." },
  );

export type SearchQuery = z.infer<typeof searchQuerySchema>;

/**
 * The envelope check only: does the body have a `results` array at all. Each
 * element is re-parsed on its own below, so one bad item never fails this.
 */
const envelopeSchema = z.object({
  results: z.array(z.unknown()),
});

/**
 * A single Adzuna listing, verified 2026-09-04 against Adzuna's own search
 * docs (`developer.adzuna.com/docs/search`): `salary_is_predicted` is a
 * literal `0`/`1` in the documented example response, never a JSON boolean,
 * so both that shape and a `"0"`/`"1"` string are accepted defensively and
 * transformed to the boolean this app renders. `id` carries no committed JSON
 * type in Adzuna's own docs, so it is coerced to a string.
 *
 * Transformed straight into the `Listing` shape this app renders (spec 0013,
 * Feature design), so the inferred output type cannot drift from what this
 * actually parses.
 */
const adzunaItemSchema = z
  .object({
    id: z.coerce.string(),
    title: z.string(),
    company: z.object({ display_name: z.string() }),
    location: z.object({ display_name: z.string() }).optional(),
    redirect_url: z.url(),
    description: z.string().optional(),
    salary_min: z.number().optional(),
    salary_max: z.number().optional(),
    salary_is_predicted: z.union([
      z.literal(0),
      z.literal(1),
      z.literal("0"),
      z.literal("1"),
    ]),
    created: z.string().optional(),
  })
  .transform((raw) => {
    /**
     * A max below the min is dropped rather than passed on inverted (Feature
     * design): `application`'s own check constraint (spec 0003) would refuse
     * it outright at feature 12's insert.
     */
    const invertedSalary =
      raw.salary_min !== undefined &&
      raw.salary_max !== undefined &&
      raw.salary_max < raw.salary_min;

    const salaryMin = invertedSalary ? undefined : raw.salary_min;
    const salaryMax = invertedSalary ? undefined : raw.salary_max;
    const hasSalary = salaryMin !== undefined || salaryMax !== undefined;

    return {
      source: ADZUNA_SOURCE,
      sourceJobId: raw.id,
      title: raw.title,
      companyName: raw.company.display_name,
      location: raw.location?.display_name,
      url: raw.redirect_url,
      descriptionSnippet: raw.description,
      salaryMin,
      salaryMax,
      salaryCurrency: hasSalary
        ? CURRENCY_BY_COUNTRY[ADZUNA_COUNTRY]
        : undefined,
      salaryIsPredicted:
        raw.salary_is_predicted === 1 || raw.salary_is_predicted === "1",
      postedAt: raw.created,
    };
  });

/** A single search result, as this app renders it (spec 0013, Feature design). */
export type Listing = z.infer<typeof adzunaItemSchema>;

/**
 * The real, verified Adzuna call: builds the request from the named
 * endpoint/`results_per_page`/timeout constants, checks `res.ok` explicitly
 * before parsing (a non success status is `external_service_failed`, never
 * handed to the parser), and drops a listing that fails its own parse rather
 * than failing the whole page (Feature design, "drop and count").
 */
async function runAdzunaSearch(query: SearchQuery): Promise<Result<Listing[]>> {
  const url = new URL(
    `https://api.adzuna.com/v1/api/jobs/${ADZUNA_COUNTRY}/search/1`,
  );
  url.searchParams.set("app_id", env.ADZUNA_APP_ID);
  url.searchParams.set("app_key", env.ADZUNA_APP_KEY);
  url.searchParams.set("results_per_page", String(RESULTS_PER_PAGE));
  if (query.title !== undefined) url.searchParams.set("what", query.title);
  if (query.location !== undefined)
    url.searchParams.set("where", query.location);

  const responseAttempt = await attempt(
    {
      kind: "external_service_failed",
      message: "Could not reach Adzuna.",
      context: { country: ADZUNA_COUNTRY },
    },
    () => fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
  );

  if (isFailure(responseAttempt)) return responseAttempt;

  const response = responseAttempt.value;

  if (!response.ok) {
    return failure({
      kind: "external_service_failed",
      severity: "unexpected",
      message: "Adzuna did not return a successful response.",
      context: { status: response.status },
    });
  }

  const bodyAttempt = await attempt(
    {
      kind: "response_malformed",
      message: "Could not read Adzuna's response.",
    },
    () => response.json() as Promise<unknown>,
  );

  if (isFailure(bodyAttempt)) return bodyAttempt;

  const envelope = envelopeSchema.safeParse(bodyAttempt.value);

  if (!envelope.success) {
    return failure({
      kind: "response_malformed",
      severity: "unexpected",
      message: "Adzuna's response did not match the shape we parse.",
      context: { issues: z.treeifyError(envelope.error) },
      cause: envelope.error,
    });
  }

  const parsed = envelope.data.results.map((item) =>
    adzunaItemSchema.safeParse(item),
  );
  const listings = parsed
    .filter((result) => result.success)
    .map((result) => result.data);

  /**
   * One bad row among twenty is Adzuna's data quality, not a broken
   * integration (feature 19 owns data quality properly). Every item failing
   * in a non empty batch is the integration itself drifting from the shape
   * Adzuna actually sends.
   */
  if (parsed.length > 0 && listings.length === 0) {
    return failure({
      kind: "response_malformed",
      severity: "unexpected",
      message: "None of Adzuna's listings matched the shape we parse.",
      context: { droppedCount: parsed.length },
    });
  }

  return success(listings);
}

/**
 * Searches Adzuna for the caller, gated through `checkUsageGate()`'s
 * `job_search` call type (spec 0011).
 *
 * A refusal is a success carrying `allowed: false` (spec 0011, AC-5), never a
 * `Failure`: see `withUsageGate()`. Blank input is refused before the gate is
 * even checked (AC-2), which is why the query is parsed first and the gate is
 * spent only once that parse succeeds.
 *
 * @param cookieAdapter The same test seam `checkUsageGate()` exposes, absent
 * in every real caller.
 */
export async function searchListings(
  input: { readonly title?: string; readonly location?: string },
  cookieAdapter?: CookieMethodsServer,
): Promise<
  Result<
    | { allowed: true; value: Listing[] }
    | { allowed: false; reason: UsageGateReason }
  >
> {
  /**
   * BINDING RULE 4: the named span opens as the FIRST statement, before the
   * query is even parsed, so a total denial still produces a span for the
   * ratio `docs/observability/spans.md` registers.
   */
  return Sentry.startSpan(
    { name: "search.run", op: "http.client" },
    async () => {
      const parsedQuery = searchQuerySchema.safeParse(input);

      if (!parsedQuery.success) {
        return failure({
          kind: "validation_failed",
          severity: "expected",
          message: "Enter a title or a location to search.",
          context: { issues: z.treeifyError(parsedQuery.error) },
        });
      }

      return withUsageGate(
        "job_search",
        () => runAdzunaSearch(parsedQuery.data),
        cookieAdapter,
      );
    },
  );
}
