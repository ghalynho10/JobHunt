import { describe, expect, it } from "vitest";

import { checkUsageGate } from "@/lib/usage-gating/gate";
import { createClient } from "@/lib/supabase/server";
import { isFailure } from "@/lib/result";

import { queryAsSuperuser } from "../helpers/database";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession } from "../helpers/session";

/**
 * Spec 0011: every test in this file mutates state `checkUsageGate()` reads
 * or writes globally, either the single `app_settings` row (spec 0002) or the
 * `usage_gate_counter` table's own privileges. `checkUsageGate()` is called
 * from every `test/integration/**` file, and Vitest schedules those files to
 * run in parallel by default, so a mutation like this races every other
 * file's concurrent gate calls, not just one assertion in one file.
 *
 * ONE FILE, DELIBERATELY, NOT ONE FILE PER SCENARIO. `vitest.config.mts`'s
 * `integration-serial` project (`sequence.groupOrder: 1`) isolates this
 * project from `test/integration/**`, running only after every file there
 * has finished. That is NOT the same guarantee as isolating the tests below
 * from EACH OTHER: `groupOrder` orders PROJECTS, and Vitest still schedules
 * the FILES within one project to run in parallel with each other by
 * default, the same as `test/integration/**` does internally. Splitting
 * these two scenarios into two files reproduced the exact race this project
 * exists to remove, confirmed 2026-09-03: the kill switch flip below raced
 * the database fault test's own RPC call and made it observe
 * `kill_switch_engaged` instead of the `database_unavailable` it was testing
 * for. Tests WITHIN one file are guaranteed sequential (confirmed against the
 * installed `@vitest/runner` 4.1.11's own task runner), which is the only
 * ordering guarantee actually available here, so every scenario needing the
 * real shared state belongs in this one file until Vitest offers a coarser
 * primitive than "one project" for this.
 *
 * See `vitest.config.mts`'s own top comment and spec 0011's Follow-up list
 * for why `fileParallelism: false` was rejected in favour of this.
 */

describe("a real engaged kill switch reaches checkUsageGate() end to end (AC-4, AC-5)", () => {
  it("refuses with kill_switch_engaged and touches no usage_gate_counter row", async () => {
    const user = await mintFixtureUser("kill-switch-usage-gate-serial");
    const session = await mintSession(user.email);

    await queryAsSuperuser(
      `update public.app_settings set kill_switch_enabled = true where id = 1`,
    );

    try {
      const before = await queryAsSuperuser<{ n: number }>(
        `select count(*)::int as n from public.usage_gate_counter
          where call_type = 'job_search'`,
      );

      const result = await checkUsageGate("job_search", session.jar);

      const after = await queryAsSuperuser<{ n: number }>(
        `select count(*)::int as n from public.usage_gate_counter
          where call_type = 'job_search'`,
      );

      if (isFailure(result)) {
        throw new Error(`Expected a decision, got a failure: ${result.kind}.`);
      }

      // The block happens in the pre-check, before `check_usage_gate` is ever
      // reached, so no window row anywhere changes at all.
      expect(result.value).toEqual({
        allowed: false,
        reason: "kill_switch_engaged",
      });
      expect(after).toEqual(before);
    } finally {
      // ALWAYS RESTORED, success or failure, before the next test in this
      // file (or a later run) reads this same row.
      await queryAsSuperuser(
        `update public.app_settings set kill_switch_enabled = false where id = 1`,
      );
      await deleteFixtureUser(user.id);
    }
  });
});

describe("a database fault while writing the counters fails closed (AC-14)", () => {
  /**
   * `job_search` is safe to use here even though the call is expected to
   * fail: the revoke breaks the function's first WRITE statement (the
   * configuration check that now runs first, spec 0011's AC-6 reordering, is
   * a `select` against `usage_cap` and is unaffected by this revoke; the
   * revoke only breaks the `usage_gate_counter` insert that follows it), so
   * the whole transaction rolls back and nothing is ever written, real
   * budget included.
   */
  it("returns database_unavailable when the function's own table access is revoked mid test", async () => {
    const user = await mintFixtureUser("gate-db-fault-revoked");
    const session = await mintSession(user.email);
    const supabase = await createClient(session.jar);
    const { error: profileError } = await supabase
      .from("profile")
      .insert({ id: user.id, full_name: "Usage Gate Fixture" });

    if (profileError) {
      throw new Error(
        `Could not seed a profile row for ${user.id}: ${profileError.message}`,
      );
    }

    /**
     * `check_usage_gate` is `SECURITY DEFINER`, owned by `postgres`, which is
     * BYPASSRLS but confirmed NOT a superuser on this stack (`select rolsuper,
     * rolbypassrls from pg_roles where rolname = 'postgres'` → f, t) — the same
     * split spec 0002's own verify.md documents for the hosted project.
     * BYPASSRLS bypasses row level security only, never table privileges, so
     * revoking the owner's own INSERT and UPDATE genuinely breaks the
     * function's unconditional attempt bump, confirmed by hand before writing
     * this test: the same revoke against a probe row raised a real
     * `permission denied for table usage_gate_counter`, not a silent no-op.
     */
    await queryAsSuperuser(
      `revoke insert, update on public.usage_gate_counter from postgres`,
    );

    try {
      const result = await checkUsageGate("job_search", session.jar);

      if (!isFailure(result)) {
        throw new Error(
          "Expected database_unavailable once the function's own table access was revoked, got a decision.",
        );
      }

      expect(result.kind).toBe("database_unavailable");
      expect(result.severity).toBe("unexpected");

      /**
       * `42501` is Postgres's `insufficient_privilege`, and it only ever
       * lands in `context.code` on the branch that reads the `.rpc()`
       * response's own `error` field (AC-14), which returns before
       * `configured`, `allowed` or `reason` is read at all. The
       * `usage_gate_misconfigured` branch's context carries no `code`, so
       * this also proves which branch was actually taken, not merely that
       * some failure occurred.
       */
      expect(result.context?.["code"]).toBe("42501");
    } finally {
      await queryAsSuperuser(
        `grant insert, update on public.usage_gate_counter to postgres`,
      );
      await deleteFixtureUser(user.id);
    }
  });
});
