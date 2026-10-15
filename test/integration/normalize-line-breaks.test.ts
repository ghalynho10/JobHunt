import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { normalizeLineBreaks } from "@/lib/line-breaks";

import { queryAsSuperuser } from "../helpers/database";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { LINE_BREAK_CASES } from "../fixtures/line-break-cases";

/**
 * The SQL line break function against its TypeScript twin, and the backfill
 * over real rows, in the real database (spec 0025, AC-5, AC-6, AC-9).
 *
 * WHY THROUGH THE DIRECT CONNECTION. The function is granted to no Data API
 * role on purpose, so no Supabase client can call it, which is the property
 * the last block below proves. `test/helpers/database.ts` is the one path that
 * reaches it, the same reason `decode-listing-text.test.ts` uses it.
 *
 * PARITY IS ASSERTED, NOT INSPECTED. Every shared case runs through both
 * implementations and the outputs are compared byte for byte, and each is
 * also compared to the case's stated answer, so the two cannot pass by
 * agreeing on a wrong output.
 */

async function sqlNormalize(input: string | null): Promise<string | null> {
  const rows = await queryAsSuperuser<{ normalized: string | null }>(
    "select public.normalize_line_breaks($1) as normalized",
    [input],
  );
  return rows[0]?.normalized ?? null;
}

const mintedUserIds: string[] = [];

afterAll(async () => {
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

describe("the SQL function matches normalizeLineBreaks() on every shared case (invariant 1)", () => {
  for (const testCase of LINE_BREAK_CASES) {
    it(testCase.name, async () => {
      // covers: spec 0025 AC-5
      const typescript = normalizeLineBreaks(testCase.input);

      expect(await sqlNormalize(testCase.input)).toBe(typescript);
      expect(typescript).toBe(testCase.expected);
    });
  }

  it("leaves a null column null", async () => {
    // covers: spec 0025 AC-5
    expect(await sqlNormalize(null)).toBeNull();
  });
});

describe("the backfill statements over real profile and work history rows (AC-6)", () => {
  /**
   * THE MIGRATION'S OWN STATEMENTS, READ OUT OF THE FILE, not copies kept
   * here, so the test cannot stay green while production runs something else.
   * Each is narrowed to this test's own rows by id, in front of the
   * migration's own guard, because running it unnarrowed would rewrite rows
   * other integration files are using in parallel. Every anchor must be found
   * exactly once, or this throws before any test runs, so a reshaped
   * migration fails loudly rather than silently testing nothing.
   */
  const migration = readFileSync(
    fileURLToPath(
      new URL(
        "../../supabase/migrations/20261015120000_normalize_line_breaks.sql",
        import.meta.url,
      ),
    ),
    "utf8",
  );

  function narrowedStatement(table: string, column: string): string {
    const start = `update public.${table}\n`;
    const guard = `where position(chr(13) in ${column}) > 0;`;
    const from = migration.indexOf(start);
    const to = migration.indexOf(guard, from);

    if (
      from === -1 ||
      from !== migration.lastIndexOf(start) ||
      to === -1 ||
      to !== migration.lastIndexOf(guard)
    ) {
      throw new Error(
        `The ${table} backfill statement in the migration no longer has the shape this test narrows.`,
      );
    }

    return migration
      .slice(from, to + guard.length)
      .replace(
        guard,
        `where id = any($1::uuid[]) and position(chr(13) in ${column}) > 0`,
      );
  }

  const PROFILE_BACKFILL = narrowedStatement("profile", "summary");
  const EXPERIENCE_BACKFILL = narrowedStatement(
    "work_experience",
    "description",
  );

  interface ProfileRow {
    readonly id: string;
    readonly full_name: string;
    readonly location: string | null;
    readonly summary: string | null;
    readonly updated_at: string;
  }

  interface ExperienceRow {
    readonly id: string;
    readonly company: string;
    readonly title: string;
    readonly location: string | null;
    readonly description: string | null;
    readonly started_on: string;
    readonly updated_at: string;
  }

  async function seedProfile(summary: string): Promise<string> {
    const user = await mintFixtureUser("line-break-backfill");
    mintedUserIds.push(user.id);
    await queryAsSuperuser(
      `insert into public.profile (id, full_name, location, summary)
       values ($1, 'Backfill Fixture', 'Berlin', $2)`,
      [user.id, summary],
    );
    return user.id;
  }

  async function seedExperience(
    profileId: string,
    description: string,
  ): Promise<string> {
    const rows = await queryAsSuperuser<{ id: string }>(
      `insert into public.work_experience
         (profile_id, company, title, location, description, started_on)
       values ($1, 'Acme', 'Engineer', 'Remote', $2, '2024-03-01')
       returning id`,
      [profileId, description],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error("Could not seed a work history row.");
    return id;
  }

  async function readProfiles(
    ids: readonly string[],
  ): Promise<readonly ProfileRow[]> {
    return queryAsSuperuser<ProfileRow>(
      `select id, full_name, location, summary, updated_at::text
         from public.profile where id = any($1::uuid[]) order by id`,
      [ids],
    );
  }

  async function readExperiences(
    ids: readonly string[],
  ): Promise<readonly ExperienceRow[]> {
    return queryAsSuperuser<ExperienceRow>(
      `select id, company, title, location, description, started_on::text,
              updated_at::text
         from public.work_experience where id = any($1::uuid[]) order by id`,
      [ids],
    );
  }

  it("converts an affected profile summary and leaves an unaffected one byte identical", async () => {
    // covers: spec 0025 AC-6
    const affected = await seedProfile("First\r\nSecond\rThird");
    const unaffected = await seedProfile("First\nSecond");

    const before = await readProfiles([affected, unaffected]);
    await queryAsSuperuser(PROFILE_BACKFILL, [[affected, unaffected]]);
    const after = await readProfiles([affected, unaffected]);

    const affectedBefore = before.find((row) => row.id === affected);
    const affectedAfter = after.find((row) => row.id === affected);

    expect(affectedAfter).toMatchObject({
      full_name: affectedBefore?.full_name,
      location: affectedBefore?.location,
      summary: "First\nSecond\nThird",
    });
    // The `set_updated_at` trigger fired on the write, which AC-6 expects.
    expect(affectedAfter?.updated_at).not.toBe(affectedBefore?.updated_at);
    // Byte identical, `updated_at` included: the guard never wrote the row.
    expect(after.find((row) => row.id === unaffected)).toEqual(
      before.find((row) => row.id === unaffected),
    );
  });

  it("converts an affected role description and leaves an unaffected one byte identical", async () => {
    // covers: spec 0025 AC-6
    const profileId = await seedProfile("No break here");
    const affected = await seedExperience(profileId, "Built it\r\n\r\nShipped");
    const unaffected = await seedExperience(profileId, "Built it\n\nShipped");

    const before = await readExperiences([affected, unaffected]);
    await queryAsSuperuser(EXPERIENCE_BACKFILL, [[affected, unaffected]]);
    const after = await readExperiences([affected, unaffected]);

    const affectedBefore = before.find((row) => row.id === affected);
    const affectedAfter = after.find((row) => row.id === affected);

    expect(affectedAfter).toMatchObject({
      company: affectedBefore?.company,
      title: affectedBefore?.title,
      location: affectedBefore?.location,
      started_on: affectedBefore?.started_on,
      description: "Built it\n\nShipped",
    });
    expect(affectedAfter?.updated_at).not.toBe(affectedBefore?.updated_at);
    expect(after.find((row) => row.id === unaffected)).toEqual(
      before.find((row) => row.id === unaffected),
    );
  });
});

describe("no Data API role can call the function (AC-9)", () => {
  for (const role of ["anon", "authenticated", "service_role"] as const) {
    it(`refuses ${role}`, async () => {
      // covers: spec 0025 AC-9
      const rows = await queryAsSuperuser<{ allowed: boolean }>(
        "select has_function_privilege($1, 'public.normalize_line_breaks(text)', 'execute') as allowed",
        [role],
      );
      expect(rows[0]?.allowed).toBe(false);
    });
  }
});
