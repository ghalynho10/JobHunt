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

import type { DemoPersonaSlug } from "./personas";

/**
 * The one read behind `/demo` (spec 0021, AC-2, AC-12).
 *
 * IT IS THE THIRD AND LAST CALLER OF THE SECRET KEY CLIENT, named in binding
 * rule 1's closed allow list (`src/lib/supabase/secret.ts`). It has to be that
 * client and not the ordinary server one: `demo_result` carries row level
 * security forced with zero policies and grants `select` to `service_role`
 * alone, so the publishable key sees nothing at all. That is the mechanism
 * behind AC-4, since a visitor holds no key that can reach this table to
 * change it.
 *
 * NOTHING HERE IS PAID (AC-2). One Postgres select, no Adzuna call, no model
 * call. `/demo` costs the same whether one person opens it or a thousand do.
 *
 * IT NEVER WRITES, AND THERE IS NO WRITE FUNCTION IN THIS FEATURE TO FORGET
 * ABOUT. The seed migration is the only thing that has ever inserted a row.
 */

/**
 * The currency every seeded figure is in (spec 0021, `## Feature design`).
 *
 * A CONSTANT RATHER THAN A COLUMN, because all twelve rows would carry the
 * same value. It is passed to `salaryText()` at render so the shared formatter
 * can be reused unchanged rather than reimplemented for a table that happens
 * to store one less field.
 */
export const DEMO_SALARY_CURRENCY = "USD";

/**
 * One seeded result, after parsing.
 *
 * `null` in the database becomes `undefined` here (`AGENTS.md`: prefer
 * `undefined` in a union over `null`).
 */
export interface DemoResult {
  readonly id: string;
  readonly title: string;
  readonly companyName: string;
  readonly location: string | undefined;
  readonly salaryMin: number | undefined;
  readonly salaryMax: number | undefined;
  readonly descriptionSnippet: string | undefined;
  readonly band: Band;
  readonly matchedSkills: readonly string[];
  readonly notMentionedSkills: readonly string[];
  readonly reasoning: string;
}

/**
 * What a row must actually be, checked rather than asserted.
 *
 * `band` IS PARSED AGAINST `BANDS` ITSELF, not against a copy of the five
 * strings. The database has its own check constraint naming the same five, and
 * the two cannot import each other, so this parse is what catches them
 * drifting: a band added to one side and not the other fails here, loudly, at
 * the boundary, instead of reaching `BandBadge` as an unstyled unknown value.
 *
 * The generated database types say what the schema claims. This says what
 * actually arrived (`AGENTS.md`: parse at every boundary).
 */
const demoResultRowSchema = z.object({
  id: z.uuid(),
  sort_order: z.number().int().positive(),
  title: z.string().min(1),
  company_name: z.string().min(1),
  location: z.string().nullable(),
  salary_min: z.number().int().nullable(),
  salary_max: z.number().int().nullable(),
  description_snippet: z.string().nullable(),
  band: z.enum(BANDS),
  matched_skills: z.array(z.string()),
  not_mentioned_skills: z.array(z.string()),
  reasoning: z.string().min(1),
});

const optional = <T>(value: T | null): T | undefined => value ?? undefined;

/**
 * One example profile's seeded results, best band first (AC-7, AC-12).
 *
 * THE ORDER IS THE ONE `/search` ALREADY USES, and it reuses `bandRank()`
 * rather than restating it, so the demo cannot show the reader an ordering the
 * real product does not use. `sort_order` breaks a tie inside one band: every
 * row in this table was inserted by a single migration in a single
 * transaction, so all twelve share one `created_at` and it can order nothing.
 *
 * A SINGLE UNPARSEABLE ROW FAILS THE WHOLE READ (AC-12, and the spec's key
 * invariants). Rendering the eleven that parsed would quietly show a shorter
 * page that looks complete, and on a page whose entire premise is that nothing
 * on it misleads, a silently missing result is the worst available outcome.
 * The visible failure state is the honest one.
 *
 * @param persona An already parsed slug, never a raw query value.
 */
export async function readDemoResults(
  persona: DemoPersonaSlug,
): Promise<Result<readonly DemoResult[]>> {
  /**
   * BINDING RULE 4: the named span opens as the FIRST statement, before the
   * client is built and before anything can return early. Registered in
   * `docs/observability/spans.md`.
   */
  return Sentry.startSpan(
    { name: "demo.read", op: "db.query" },
    async (): Promise<Result<readonly DemoResult[]>> => {
      const supabase = createSecretClient();

      /**
       * BINDING RULE 5: `attempt()` converts a thrown exception, and ONLY a
       * thrown exception. The Supabase client throws on a transport failure
       * but returns `{ data, error }` for a permission denial, so the returned
       * `error` is checked separately below. A missing
       * `grant select ... to service_role` arrives that second way, and
       * reading only what comes back would report it as a malformed response.
       */
      const attempted = await attempt(
        {
          kind: "database_unavailable",
          message: "Could not reach the database to read the demo results.",
          context: { persona },
        },
        async () =>
          await supabase
            .from("demo_result")
            .select(
              "id, sort_order, title, company_name, location, salary_min, salary_max, description_snippet, band, matched_skills, not_mentioned_skills, reasoning",
            )
            .eq("persona_slug", persona)
            .order("sort_order", { ascending: true }),
      );

      if (isFailure(attempted)) return attempted;

      const { data, error } = attempted.value;

      if (error) {
        return failure({
          kind: "database_unavailable",
          severity: "unexpected",
          message: "The database refused the demo results read.",
          context: { persona, code: error.code, hint: error.hint },
          cause: error,
        });
      }

      /**
       * Unexpected, not expected. Both profiles' rows are inserted by the
       * migration that creates the table, so an empty answer for a slug this
       * application recognises means the seed did not land, which is something
       * broken rather than the system working and the answer being no.
       */
      if (data.length === 0) {
        return failure({
          kind: "record_not_found",
          severity: "unexpected",
          message: "No seeded demo results exist for this example profile.",
          context: { persona },
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
       * SORTED BEFORE MAPPING, so `sort_order` never has to appear on
       * `DemoResult`. It is an ordering detail of the seed data and nothing
       * that renders reads it, so exporting it would invite a caller to
       * re-sort by it and lose the band order this establishes.
       *
       * BOTH KEYS ARE COMPARED EXPLICITLY rather than leaning on the query's
       * own `sort_order` ordering plus a stable sort. `Array.prototype.sort`
       * is specified as stable, so the shorter version would work today; it
       * would also make this ordering depend on a property of the SQL above
       * that nothing here states, and moving the query's `order()` would then
       * silently scramble the ties.
       */
      const ordered = [...parsed.data].sort(
        (left, right) =>
          bandRank(left.band) - bandRank(right.band) ||
          left.sort_order - right.sort_order,
      );

      return success(
        ordered.map((row): DemoResult => ({
          id: row.id,
          title: row.title,
          companyName: row.company_name,
          location: optional(row.location),
          salaryMin: optional(row.salary_min),
          salaryMax: optional(row.salary_max),
          descriptionSnippet: optional(row.description_snippet),
          band: row.band,
          matchedSkills: row.matched_skills,
          notMentionedSkills: row.not_mentioned_skills,
          reasoning: row.reasoning,
        })),
      );
    },
  );
}
