import "server-only";

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

import { BANDS, bandRank, type Band } from "@/features/scoring/rubric";
import {
  attempt,
  failure,
  isFailure,
  success,
  type Result,
} from "@/lib/result";
import { createSecretClient } from "@/lib/supabase/secret";

import { DEMO_PERSONAS, type DemoPersonaSlug } from "./personas";

/**
 * The two reads behind `/demo` (spec 0021, AC-2, AC-12, AC-14, AC-15, AC-16).
 *
 * THEY USE THE SECRET KEY CLIENT, named in binding rule 1's closed allow list
 * (`src/lib/supabase/secret.ts`) as caller 3. It has to be that client and not
 * the ordinary server one: both tables carry row level security forced with
 * zero policies and grant `select` to `service_role` alone, so the publishable
 * key sees nothing at all. That is still the mechanism behind AC-4, since a
 * visitor holds no key that can reach either table, to read or to change.
 *
 * NOTHING HERE IS PAID (AC-2). Two Postgres selects, no Adzuna call, no model
 * call. `/demo` costs the same whether one person opens it or a thousand do.
 * Every paid call this feature makes happens in `refresh.ts`, behind a secret,
 * never on a render.
 *
 * THIS MODULE NEVER WRITES. `refresh.ts` is the only writer in this feature,
 * and it writes through one Postgres function rather than through here.
 */

/**
 * One result row, after parsing.
 *
 * `null` in the database becomes `undefined` here (`AGENTS.md`: prefer
 * `undefined` in a union over `null`).
 */
export interface DemoResult {
  readonly id: string;
  /** Adzuna's own listing id. What pairs this row with the other persona's. */
  readonly sourceJobId: string;
  /** Which of the two fixed queries kept this listing. */
  readonly searchTitle: string;
  readonly title: string;
  readonly companyName: string;
  readonly location: string | undefined;
  readonly salaryMin: number | undefined;
  readonly salaryMax: number | undefined;
  /** Present exactly when either figure is, by the table's own constraint. */
  readonly salaryCurrency: string | undefined;
  readonly salaryIsPredicted: boolean;
  readonly descriptionSnippet: string | undefined;
  readonly band: Band;
  /** Already shortened: the grounding check's flagged names are not in here. */
  readonly matchedSkills: readonly string[];
  readonly notMentionedSkills: readonly string[];
  /** Empty means the check ran and flagged nothing, never that it did not run. */
  readonly ungroundedSkills: readonly string[];
  readonly reasoning: string;
}

/**
 * One listing as a card renders it: this persona's result, and the band the
 * other persona gave the same listing (AC-16).
 *
 * THE OTHER BAND IS A REQUIRED FIELD AND NOT AN OPTIONAL ONE. Both personas'
 * rows for every kept listing are written together by one transaction
 * (AC-17), so a listing with only one persona's row is a broken invariant
 * rather than a case to render around. The read below fails loudly on it
 * instead of hiding the line, which is the whole point of typing it this way.
 */
export interface DemoScoredListing {
  readonly own: DemoResult;
  readonly otherBand: Band;
  /** The other persona's label, so the card names who scored it that way. */
  readonly otherPersonaLabel: string;
}

/** What the last refresh searched for, and when it ran (AC-14, AC-15). */
export interface DemoRefreshState {
  /**
   * BOTH QUERIES, IN THE ORDER THEY RAN, as a pair rather than an array. The
   * table's own check guarantees exactly two, and the parse below checks it
   * again, so the page can name both without an `undefined` branch that
   * `noUncheckedIndexedAccess` would otherwise force on it.
   */
  readonly searchTitles: readonly [string, string];
  readonly searchLocation: string | undefined;
  /** `undefined` means no refresh has ever run, which is AC-15's state. */
  readonly refreshedAt: string | undefined;
}

/** Everything `/demo` renders, from one successful read. */
export interface DemoPageData {
  readonly refresh: DemoRefreshState;
  /** Empty exactly when no refresh has ever run (AC-15). */
  readonly results: readonly DemoScoredListing[];
}

/**
 * What a result row must actually be, checked rather than asserted.
 *
 * `band` IS PARSED AGAINST `BANDS` ITSELF, not against a copy of the five
 * strings. The database has its own check constraint naming the same five, and
 * the two cannot import each other, so this parse is what catches them
 * drifting: a band added to one side and not the other fails here, loudly, at
 * the boundary, instead of reaching `BandBadge` as an unstyled unknown value.
 *
 * `persona_slug` IS PARSED THE SAME WAY, against the slugs this application
 * actually renders. A row written under a slug the switcher does not know
 * would otherwise be silently dropped by the grouping below, leaving a shorter
 * page that looks complete.
 *
 * The generated database types say what the schema claims. This says what
 * actually arrived (`AGENTS.md`: parse at every boundary).
 */
const demoResultRowSchema = z.object({
  id: z.uuid(),
  persona_slug: z.enum(
    DEMO_PERSONAS.map((persona) => persona.slug) as [
      DemoPersonaSlug,
      ...DemoPersonaSlug[],
    ],
  ),
  source_job_id: z.string().min(1),
  sort_order: z.number().int().positive(),
  search_title: z.string().min(1),
  title: z.string().min(1),
  company_name: z.string().min(1),
  location: z.string().nullable(),
  /**
   * `numeric(12, 2)` ARRIVES AS A NUMBER, NOT AN INTEGER, which is the change
   * from the fabricated version's hand written round figures. These are
   * Adzuna's own values now, and `z.number().int()` would fail a perfectly
   * ordinary posting that states a salary with cents.
   */
  salary_min: z.number().nullable(),
  salary_max: z.number().nullable(),
  salary_currency: z.string().min(1).nullable(),
  salary_is_predicted: z.boolean(),
  description_snippet: z.string().nullable(),
  band: z.enum(BANDS),
  matched_skills: z.array(z.string()),
  not_mentioned_skills: z.array(z.string()),
  ungrounded_skills: z.array(z.string()),
  reasoning: z.string().min(1),
});

/** What the singleton refresh row must actually be. */
const demoRefreshRowSchema = z.object({
  search_titles: z.tuple([z.string().min(1), z.string().min(1)]),
  search_location: z.string().nullable(),
  refreshed_at: z.string().nullable(),
});

const optional = <T>(value: T | null): T | undefined => value ?? undefined;

/**
 * Everything `/demo` needs, for one example profile (AC-7, AC-12, AC-15, AC-16).
 *
 * THE ORDER IS THE ONE `/search` ALREADY USES, and it reuses `bandRank()`
 * rather than restating it, so the demo cannot show the reader an ordering the
 * real product does not use. `sort_order`, which is the order the refresh's
 * walk kept each listing (it interleaves the two searches, each in Adzuna's own
 * order), breaks a tie inside one band: every row in this table is
 * written by one transaction, so all of them share one `created_at` and it can
 * order nothing.
 *
 * A SINGLE UNPARSEABLE ROW FAILS THE WHOLE READ (AC-12, and the spec's key
 * invariants). Rendering the rows that parsed would quietly show a shorter page
 * that looks complete, and on a page whose entire premise is that nothing on it
 * misleads, a silently missing result is the worst available outcome. The
 * visible failure state is the honest one.
 *
 * AN EMPTY TABLE IS NOT A FAILURE, WHICH IS THE OPPOSITE OF WHAT THIS FUNCTION
 * USED TO DO (AC-15). Rows used to arrive with the migration that created the
 * table, so an empty answer meant the seed had not landed and was genuinely
 * broken. Rows now arrive from a refresh that may simply not have run yet, so
 * "no refresh has ever run" is an ordinary, expected, temporary state and is
 * returned as a success carrying that fact. The two are told apart
 * structurally, by `demo_refresh.refreshed_at` being null, never by inspecting
 * an error.
 *
 * @param persona An already parsed slug, never a raw query value.
 */
export async function readDemoPage(
  persona: DemoPersonaSlug,
): Promise<Result<DemoPageData>> {
  /**
   * BINDING RULE 4: the named span opens as the FIRST statement, before the
   * client is built and before anything can return early. Registered in
   * `docs/observability/spans.md`.
   */
  return Sentry.startSpan(
    { name: "demo.read", op: "db.query" },
    async (): Promise<Result<DemoPageData>> => {
      const supabase = createSecretClient();

      const refreshRead = await attempt(
        {
          kind: "database_unavailable",
          message: "Could not reach the database to read the demo refresh row.",
          context: { persona },
        },
        async () =>
          await supabase
            .from("demo_refresh")
            .select("search_titles, search_location, refreshed_at")
            .eq("id", 1)
            .maybeSingle(),
      );

      if (isFailure(refreshRead)) return refreshRead;

      if (refreshRead.value.error) {
        return failure({
          kind: "database_unavailable",
          severity: "unexpected",
          message: "The database refused the demo refresh read.",
          context: {
            persona,
            code: refreshRead.value.error.code,
            hint: refreshRead.value.error.hint,
          },
          cause: refreshRead.value.error,
        });
      }

      /**
       * The migration inserts this row, so its absence is a broken deployment
       * rather than an expected emptiness. AC-15's state is this row present
       * with a null `refreshed_at`, which is a different fact entirely.
       */
      if (refreshRead.value.data === null) {
        return failure({
          kind: "record_not_found",
          severity: "unexpected",
          message: "The demo refresh row is missing.",
          context: { persona },
        });
      }

      const parsedRefresh = demoRefreshRowSchema.safeParse(
        refreshRead.value.data,
      );

      if (!parsedRefresh.success) {
        return failure({
          kind: "response_malformed",
          severity: "unexpected",
          message: "The demo refresh row did not match the shape we parse.",
          context: { persona, issues: z.treeifyError(parsedRefresh.error) },
          cause: parsedRefresh.error,
        });
      }

      const refresh: DemoRefreshState = {
        searchTitles: parsedRefresh.data.search_titles,
        searchLocation: optional(parsedRefresh.data.search_location),
        refreshedAt: optional(parsedRefresh.data.refreshed_at),
      };

      /**
       * AC-15, AND THE SECOND QUERY IS SKIPPED RATHER THAN RUN AND IGNORED.
       * The only writer sets `refreshed_at` and the result rows in the same
       * transaction (AC-17), so a null here proves the table is empty. Asking
       * anyway would spend a round trip to learn something already known.
       */
      if (refresh.refreshedAt === undefined) {
        return success({ refresh, results: [] });
      }

      /**
       * BINDING RULE 5: `attempt()` converts a thrown exception, and ONLY a
       * thrown exception. The Supabase client throws on a transport failure
       * but returns `{ data, error }` for a permission denial, so the returned
       * `error` is checked separately below. A missing
       * `grant select ... to service_role` arrives that second way, and
       * reading only what comes back would report it as a malformed response.
       *
       * ONE QUERY FOR BOTH PERSONAS, NOT ONE PER PERSONA. AC-16 needs the
       * other persona's band on every card, and two queries could observe two
       * different refreshes if one landed between them, which would put two
       * personas' scores of two different searches side by side on one card.
       */
      const resultsRead = await attempt(
        {
          kind: "database_unavailable",
          message: "Could not reach the database to read the demo results.",
          context: { persona },
        },
        async () =>
          await supabase
            .from("demo_result")
            .select(
              "id, persona_slug, source_job_id, sort_order, search_title, title, company_name, location, salary_min, salary_max, salary_currency, salary_is_predicted, description_snippet, band, matched_skills, not_mentioned_skills, ungrounded_skills, reasoning",
            )
            .order("sort_order", { ascending: true }),
      );

      if (isFailure(resultsRead)) return resultsRead;

      const { data, error } = resultsRead.value;

      if (error) {
        return failure({
          kind: "database_unavailable",
          severity: "unexpected",
          message: "The database refused the demo results read.",
          context: { persona, code: error.code, hint: error.hint },
          cause: error,
        });
      }

      const parsed = z.array(demoResultRowSchema).safeParse(data);

      if (!parsed.success) {
        return failure({
          kind: "response_malformed",
          severity: "unexpected",
          message: "A demo result row did not match the shape we parse.",
          context: { persona, issues: z.treeifyError(parsed.error) },
          cause: parsed.error,
        });
      }

      /**
       * A refresh has run, so rows must exist: the write is one transaction
       * that sets `refreshed_at` and inserts the rows together, and the
       * refresh refuses to publish an empty set at all. An empty table here is
       * therefore a broken invariant, not AC-15's expected emptiness, and it
       * gets AC-12's visible failure rather than a page claiming a refresh
       * time above no results.
       */
      if (parsed.data.length === 0) {
        return failure({
          kind: "record_not_found",
          severity: "unexpected",
          message: "The demo results are empty although a refresh has run.",
          context: { persona, refreshedAt: refresh.refreshedAt },
        });
      }

      const results = pairResults(parsed.data, persona);

      if (isFailure(results)) return results;

      return success({ refresh, results: results.value });
    },
  );
}

/** A parsed row, before it is turned into the shape a card reads. */
type DemoResultRow = z.infer<typeof demoResultRowSchema>;

/**
 * The active persona's ordered list, each row carrying its sibling's band.
 *
 * THE PAIRING IS BY `source_job_id`, WHICH IS ADZUNA'S OWN LISTING ID, and not
 * by title and company text. The two personas' rows for one posting are two
 * judgments of the same advert, and matching them on prose would pair two
 * genuinely different postings that happen to share a title at the same
 * employer.
 *
 * A MISSING SIBLING IS A FAILURE, NOT A HIDDEN LINE (AC-16). Both rows are
 * written together, so one without the other means something wrote this table
 * that is not the refresh, and a card quietly dropping its cross persona line
 * would be the page hiding exactly the comparison it exists to show.
 */
function pairResults(
  rows: readonly DemoResultRow[],
  persona: DemoPersonaSlug,
): Result<readonly DemoScoredListing[]> {
  const other = DEMO_PERSONAS.find((entry) => entry.slug !== persona);

  /**
   * Unreachable while `DEMO_PERSONAS` holds two entries, and handled rather
   * than asserted away: a one persona list would otherwise make every card's
   * cross persona line silently impossible while everything still rendered.
   */
  if (other === undefined) {
    return failure({
      kind: "record_not_found",
      severity: "unexpected",
      message: "There is no second example profile to compare against.",
      context: { persona },
    });
  }

  const siblingBands = new Map<string, Band>(
    rows
      .filter((row) => row.persona_slug === other.slug)
      .map((row) => [row.source_job_id, row.band]),
  );

  const own = rows.filter((row) => row.persona_slug === persona);

  if (own.length === 0) {
    return failure({
      kind: "record_not_found",
      severity: "unexpected",
      message: "No demo results exist for this example profile.",
      context: { persona },
    });
  }

  /**
   * BOTH KEYS ARE COMPARED EXPLICITLY rather than leaning on the query's own
   * `sort_order` ordering plus a stable sort. `Array.prototype.sort` is
   * specified as stable, so the shorter version would work today; it would
   * also make this ordering depend on a property of the SQL above that nothing
   * here states, and moving the query's `order()` would then silently scramble
   * the ties.
   */
  const ordered = [...own].sort(
    (left, right) =>
      bandRank(left.band) - bandRank(right.band) ||
      left.sort_order - right.sort_order,
  );

  const results: DemoScoredListing[] = [];

  for (const row of ordered) {
    const otherBand = siblingBands.get(row.source_job_id);

    if (otherBand === undefined) {
      return failure({
        kind: "record_not_found",
        severity: "unexpected",
        message: "A demo listing is missing the other example profile's score.",
        context: { persona, sourceJobId: row.source_job_id },
      });
    }

    results.push({
      own: toDemoResult(row),
      otherBand,
      otherPersonaLabel: other.label,
    });
  }

  return success(results);
}

function toDemoResult(row: DemoResultRow): DemoResult {
  return {
    id: row.id,
    sourceJobId: row.source_job_id,
    searchTitle: row.search_title,
    title: row.title,
    companyName: row.company_name,
    location: optional(row.location),
    salaryMin: optional(row.salary_min),
    salaryMax: optional(row.salary_max),
    salaryCurrency: optional(row.salary_currency),
    salaryIsPredicted: row.salary_is_predicted,
    descriptionSnippet: optional(row.description_snippet),
    band: row.band,
    matchedSkills: row.matched_skills,
    notMentionedSkills: row.not_mentioned_skills,
    ungroundedSkills: row.ungrounded_skills,
    reasoning: row.reasoning,
  };
}
