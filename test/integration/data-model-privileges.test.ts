import { describe, expect, it } from "vitest";

import { queryAsSuperuser } from "../helpers/database";

/**
 * Spec 0003, AC-17 (with AC-2's "anon and service_role hold nothing"): what
 * each of the six user data tables grants, read with `has_table_privilege` on
 * the real local stack.
 *
 * EVERY TABLE PRIVILEGE POSTGRES 17 HAS, not only the four a policy can govern.
 * `verify.sql` once checked select, insert, update and delete alone, and passed
 * while `authenticated` still held Supabase's default truncate, references,
 * trigger and maintain on all six (`/check verify master resume`, 2026-09-30).
 * Truncate is the one row level security never applies to.
 *
 * EACH TABLE AGAINST ITS OWN EXPECTED SET, never one shared set: `profile_skill`
 * has no update path by design (AC-4), so a uniform expectation would either
 * fail it or quietly allow a widening there.
 *
 * Local and CI only, through the direct connection, which refuses any host that
 * is not local. Production's proof is the manual `verify-production.sql` run.
 */

const ALL_PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
  "MAINTAIN",
] as const;

const FULL = [
  "authenticated DELETE",
  "authenticated INSERT",
  "authenticated SELECT",
  "authenticated UPDATE",
] as const;

const EXPECTED: readonly (readonly [string, readonly string[]])[] = [
  ["profile", FULL],
  [
    "profile_skill",
    ["authenticated DELETE", "authenticated INSERT", "authenticated SELECT"],
  ],
  ["work_experience", FULL],
  ["job_preference", FULL],
  ["application", FULL],
  ["application_answer", FULL],
];

describe("each user data table grants exactly its own list (AC-17, AC-2)", () => {
  it.each(EXPECTED)("%s", async (table, expected) => {
    // covers: AC-17, AC-2
    const rows = await queryAsSuperuser<{
      role: string;
      privilege: string;
      held: boolean;
    }>(
      `select role, privilege, has_table_privilege(role, ('public.' || $1)::regclass, privilege) as held
         from unnest(array['authenticated', 'anon', 'service_role']) as role,
              unnest($2::text[]) as privilege
        order by role, privilege`,
      [table, ALL_PRIVILEGES],
    );
    const held = rows
      .filter((row) => row.held)
      .map((row) => `${row.role} ${row.privilege}`);

    expect(rows).toHaveLength(3 * ALL_PRIVILEGES.length);
    expect(held).toEqual(expected);
  });
});
