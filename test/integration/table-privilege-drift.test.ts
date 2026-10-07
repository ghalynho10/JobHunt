import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { queryAsSuperuser } from "../helpers/database";

/**
 * Spec 0003, AC-18: no table in `public` grants `authenticated` truncate,
 * references, trigger or maintain, so the next table cannot reopen the gap
 * AC-17 closed on the six.
 *
 * EVERY ordinary or partitioned table in `public`, found at run time, not a
 * list: a list is exactly what the next migration forgets to extend.
 *
 * NOT MADE REDUNDANT BY AC-19's default privilege fix, which covers tables
 * `postgres` creates. This still catches a table created by another role, whose
 * own default (`supabase_admin` grants all eight) a migration cannot alter, and
 * a hand written grant that bypasses the convention.
 *
 * `authenticated` only. `service_role` holding the same four on four tables is
 * an accepted risk (spec 0003, Security model, 2026-10-05), and `anon` holds
 * nothing anywhere by the explicit revoke pattern AC-2 set.
 *
 * Local and CI only, through the direct connection, which refuses any host that
 * is not local. It makes no claim about production.
 */

describe("no table in public grants authenticated more than a policy can govern (AC-18)", () => {
  it("finds no truncate, references, trigger or maintain held by authenticated", async () => {
    // covers: AC-18
    const scanned = await queryAsSuperuser<{ relname: string }>(
      `select c.relname
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
        order by c.relname`,
    );
    const held = await queryAsSuperuser<{ relname: string; privilege: string }>(
      `select c.relname, privilege
         from pg_class c join pg_namespace n on n.oid = c.relnamespace,
              unnest(array['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) as privilege
        where n.nspname = 'public' and c.relkind in ('r', 'p')
          and has_table_privilege('authenticated', c.oid, privilege)
        order by c.relname, privilege`,
    );

    // An empty result is only proof if the scan saw the tables at all: a wrong
    // schema or relkind filter would also return nothing and read as a pass.
    expect(scanned.map((row) => row.relname)).toEqual(
      expect.arrayContaining([
        "profile",
        "profile_skill",
        "work_experience",
        "job_preference",
        "application",
        "application_answer",
        "resume_version",
      ]),
    );
    expect(held.map((row) => `${row.relname} ${row.privilege}`)).toEqual([]);
  });
});

/**
 * Spec 0003, AC-19: a table `postgres` creates from here on receives nothing
 * by default. THE OUTCOME, NOT THE SETTING: this never reads `pg_default_acl`,
 * which the manual `verify-production.sql` already does. It creates a table and
 * asks what the three API roles actually hold on it.
 *
 * NOTHING IS EVER COMMITTED. The whole probe is one `do` block that always
 * raises, carrying its finding in the message, so the table rolls back on a
 * pass and on a failure alike. A committed table, even briefly, would also
 * reach the drift guard above while files run in parallel, and would make
 * PostgREST reload its schema mid suite.
 *
 * The owner is in the message because the default is per creating role: a
 * probe run as a role with no default of its own would hold nothing and pass
 * for the wrong reason.
 */
describe("a table postgres creates from here on receives nothing by default (AC-19)", () => {
  it("grants anon, authenticated and service_role none of the eight table privileges", async () => {
    // covers: AC-19
    // Hex only, from our own random bytes, so interpolating it is safe.
    const table = `zz_ac19_default_probe_${randomBytes(6).toString("hex")}`;

    const outcome = await queryAsSuperuser(
      `do $probe$
       declare
         held text;
         owner text;
       begin
         create table public.${table} (id int);
         select pg_get_userbyid(relowner) into owner
           from pg_class where oid = 'public.${table}'::regclass;
         select coalesce(string_agg(role || ' ' || privilege, ', ' order by role, privilege), 'nothing')
           into held
           from unnest(array['anon', 'authenticated', 'service_role']) as role,
                unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']) as privilege
          where has_table_privilege(role, 'public.${table}'::regclass, privilege);
         raise exception 'AC-19 probe: owner %, held %', owner, held;
       end
       $probe$`,
    ).then(
      () =>
        "the probe returned without raising, so its table may have been committed",
      (error: unknown) =>
        error instanceof Error ? error.message : String(error),
    );
    const [leftBehind] = await queryAsSuperuser<{ found: boolean }>(
      "select to_regclass($1) is not null as found",
      [`public.${table}`],
    );

    expect(outcome).toBe("AC-19 probe: owner postgres, held nothing");
    expect(leftBehind).toEqual({ found: false });
  });
});
