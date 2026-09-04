import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { isKillSwitchEngaged, readKillSwitch } from "@/lib/kill-switch";
import { isFailure } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

import { createCookieJar } from "../helpers/cookie-jar";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession } from "../helpers/session";

/**
 * Spec 0002, AC-8 and AC-9: the kill switch against the real local stack.
 *
 * The switch is one row in `public.app_settings` with row level security forced
 * and NO POLICIES AT ALL, plus a single `grant select ... to service_role`. That
 * is two independent gates, and the point of both is that stopping the spend
 * requires access to the deployment, never a privilege inside the product.
 *
 * Two claims are proved here that no unit test can reach, because both are
 * enforced by Postgres rather than by application code: that a user's token is
 * refused outright, and that a read which cannot succeed says so out loud
 * instead of reading as "off". The fail closed decision itself is proved in
 * `src/lib/kill-switch.test.ts`, without the stack.
 *
 * NO TEST HERE ENGAGES THE REAL SWITCH, deliberately, even though tests
 * within one file run sequentially in this Vitest version (confirmed against
 * the installed `@vitest/runner` 4.1.11, `chunk-artifact.js`'s task runner:
 * a non concurrent suite runs its tasks through a plain `for` loop). That
 * fixes a flip racing THIS file's own read below, but not the wider problem:
 * `app_settings` is read by every `checkUsageGate()` call across every
 * integration file, and Vitest schedules different FILES to run in parallel
 * by default. Tried once (2026-09-03) as a same file placement and reverted
 * after it broke `test/integration/usage-gating.test.ts`'s own, unrelated
 * account week burst test twice in three extra runs: that test's calls landed
 * mid flight while this file's engaged the switch, and every one of them came
 * back refused for the wrong reason. Fixing this for real needs either
 * `fileParallelism: false` in `vitest.config.mts` (serialises the whole
 * integration project, a real cost, and an existing config this test suite
 * should not edit on its own) or a lock every caller of `checkUsageGate()`
 * would have to participate in, not just this file. Until one of those
 * exists, the real engaged switch stays a `/check verify` observation
 * (`docs/specs/0011-usage-gating-and-kill-switch/verify.md`), not a
 * committed assertion.
 */

const mintedUserIds: string[] = [];

async function freshUser(prefix: string) {
  const user = await mintFixtureUser(prefix);
  mintedUserIds.push(user.id);

  return user;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

afterAll(async () => {
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

describe("the settings row is out of the product's reach (AC-9)", () => {
  it("refuses a signed in user's token with a hard denial, not an empty row", async () => {
    const user = await freshUser("kill-switch-reader");
    const session = await mintSession(user.email);
    const client = await createClient(session.jar);

    const { data, error } = await client
      .from("app_settings")
      .select("kill_switch_enabled");

    /**
     * THE DISTINCTION IS THE WHOLE POINT. An empty array would be
     * indistinguishable from "the switch is off", so the table is gated at the
     * PRIVILEGE check rather than by a policy: `revoke all ... from anon,
     * authenticated` means the query is refused before row level security is
     * ever consulted. 42501 is Postgres `insufficient_privilege`.
     */
    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(data).toBeNull();

    /**
     * THE CONTROL, and without it the assertions above could pass for the wrong
     * reason. The SAME client and the SAME session reach a table this user is
     * allowed to reach, and are answered normally. So the refusal above is
     * about `app_settings` specifically, not a broken client, an expired
     * session or an unreachable stack, each of which would also have produced
     * "no data".
     */
    const { error: allowed } = await client.from("profile").select("id");

    expect(allowed).toBeNull();
  });

  it("refuses an anonymous request the same way", async () => {
    const client = await createClient(createCookieJar());

    const { data, error } = await client
      .from("app_settings")
      .select("kill_switch_enabled");

    // The revoke names `anon` as well as `authenticated`, so signing out is not
    // a way around it either.
    expect(error?.code).toBe("42501");
    expect(data).toBeNull();
  });
});

describe("the switch reads through the one caller allowed to read it", () => {
  it("returns the stored state and the raw timestamp", async () => {
    const result = await readKillSwitch();

    if (isFailure(result)) {
      throw new Error(
        `Expected a successful read, got ${result.kind}: ${result.message}. A failure here usually means the 'grant select on public.app_settings to service_role' is gone, which would read in production as a kill switch stuck permanently on.`,
      );
    }

    // The seeded default. The row is inserted by the migration that creates the
    // table, so this is the state a fresh stack is always in.
    expect(result.value.enabled).toBe(false);

    /**
     * Stored raw and formatted at render, per the project rule. An ISO
     * timestamp carrying its offset is what the schema parses, and a module
     * that started returning a formatted date would break the parse rather
     * than quietly changing what a caller sees.
     */
    expect(result.value.updatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );

    expect(isKillSwitchEngaged(result)).toBe(false);
  });
});

describe("a broken read is visible, never a quiet off (AC-8)", () => {
  it("names the failure and still engages the switch", async () => {
    vi.resetModules();
    /**
     * A well formed key that is not the real one, which is what a rotated or
     * mistyped secret actually looks like. This is the deliberate break the
     * engineer proved by hand twice on a production shaped build; automating it
     * is the only way it survives a refactor.
     */
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_this_is_not_the_real_key");

    const brokenRead = await import("@/lib/kill-switch");

    const result = await brokenRead.readKillSwitch();

    if (!isFailure(result)) {
      throw new Error(
        "The read succeeded with a secret key that is not the real one, so the key is not actually being checked and this test proves nothing.",
      );
    }

    // Named for what it is. `record_not_found` or `response_malformed` here
    // would send someone hunting a missing row instead of a wrong key.
    expect(result.kind).toBe("database_unavailable");

    // Unexpected, so it reports at error level rather than blending into the
    // expected failure rate.
    expect(result.severity).toBe("unexpected");

    /**
     * AC-8's real requirement, and the reason the two halves are asserted
     * together: a deliberate flip and a broken read are DIFFERENT EVENTS, only
     * one of which is the system working, and both must stop the spending.
     */
    expect(brokenRead.isKillSwitchEngaged(result)).toBe(true);
  });
});
