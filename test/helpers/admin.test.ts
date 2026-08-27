import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0004, AC-3: the session mint fails closed.
 *
 * The claim being proved is that the secret key path can never mint a session
 * on a deployed site. That rests entirely on `DEV_SESSION_ENABLED` defaulting
 * to false, so an environment that simply never sets it is refused. This is the
 * test that stops that guard being quietly removed.
 *
 * A UNIT TEST, NOT AN INTEGRATION ONE, DELIBERATELY: the refusal has to happen
 * before anything reaches the network, so a test that needed the stack running
 * would be proving the wrong thing. It also means `pnpm test` covers the
 * security guard on every run, with no Docker required.
 *
 * NOTHING HERE IS MOCKED. `vi.stubEnv` changes the real variable and the
 * modules are genuinely re-imported, so `src/env.ts` re-parses the real
 * environment and the helper reads a real `env` object. A stubbed guard would
 * be exactly the mock encoding the same assumption as the code under test that
 * this whole feature exists to make impossible.
 */

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/**
 * Re-imports the helper against whatever the environment currently says.
 * `vi.resetModules()` above is what makes this a fresh parse rather than the
 * cached module `.env.test` already produced.
 */
async function loadAdmin() {
  return import("./admin");
}

describe("the development only guard", () => {
  it("refuses when DEV_SESSION_ENABLED is explicitly false", async () => {
    vi.stubEnv("DEV_SESSION_ENABLED", "false");

    const { devOnlyAdminClient, DevSessionDisabledError } = await loadAdmin();

    expect(() => devOnlyAdminClient()).toThrow(DevSessionDisabledError);
  });

  it("refuses when DEV_SESSION_ENABLED is absent, which is how it fails closed", async () => {
    // The important case by far. Production never sets this variable, so
    // "absent" is the state the guarantee actually depends on, and a guard that
    // only handled an explicit `false` would be no guard at all.
    vi.stubEnv("DEV_SESSION_ENABLED", undefined);

    const { devOnlyAdminClient, DevSessionDisabledError } = await loadAdmin();

    expect(() => devOnlyAdminClient()).toThrow(DevSessionDisabledError);
  });

  it("says why it refused, naming the variable", async () => {
    vi.stubEnv("DEV_SESSION_ENABLED", undefined);

    const { devOnlyAdminClient } = await loadAdmin();

    // No silent failures: the refusal has to be readable by whoever hits it.
    expect(() => devOnlyAdminClient()).toThrow(/DEV_SESSION_ENABLED/);
  });

  it("builds a client when development is explicitly enabled", async () => {
    vi.stubEnv("DEV_SESSION_ENABLED", "true");

    const { devOnlyAdminClient } = await loadAdmin();

    // The other half of the guard. Without this the refusal above would also
    // pass against a helper that refused unconditionally.
    expect(devOnlyAdminClient()).toBeDefined();
  });

  it("refuses a malformed value rather than reading it as false", async () => {
    // `z.stringbool()` in src/env.ts rejects this outright. Quietly reading an
    // unrecognised value as false would be a silent failure in the safe
    // direction and still the wrong shape: the variable would look set and not
    // be. Checked against the installed Zod rather than assumed, since
    // `z.stringbool()` accepts rather more than "true" and "false": "1", "yes",
    // "on", "y" and "enabled" are all truthy, and their opposites falsy.
    vi.stubEnv("DEV_SESSION_ENABLED", "maybe");

    await expect(loadAdmin()).rejects.toThrow();
  });

  it("reads the other spellings z.stringbool() accepts", async () => {
    // Documented by a test rather than by a comment alone, because an
    // environment set to `DEV_SESSION_ENABLED=no` on the assumption that only
    // "false" counts would otherwise look blocked while being wide open.
    vi.stubEnv("DEV_SESSION_ENABLED", "no");

    const { devOnlyAdminClient, DevSessionDisabledError } = await loadAdmin();

    expect(() => devOnlyAdminClient()).toThrow(DevSessionDisabledError);
  });
});
