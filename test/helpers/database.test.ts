import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DirectDatabaseDisabledError, queryAsSuperuser } from "./database";

/**
 * The guard on the direct database connection (spec 0007).
 *
 * This helper connects to Postgres as a superuser role, which is a wider
 * privilege than anything else in the repository holds, including the secret
 * key client. So the refusals are the point, and each one is proved rather than
 * assumed.
 *
 * A UNIT TEST, NOT AN INTEGRATION ONE, DELIBERATELY, the same call
 * `admin.test.ts` makes: every refusal below has to happen BEFORE a socket is
 * opened, so a test that needed the stack running would be proving the wrong
 * thing. It also means `pnpm test` covers the guard on every run, with no Docker
 * required.
 *
 * NOTHING IS MOCKED. `vi.stubEnv` changes the real variable and the helper reads
 * the real `process.env`. A stubbed guard would be the mock encoding the same
 * assumption as the code under test that this project's testing rule forbids.
 */

beforeEach(() => {
  vi.stubEnv("TEST_DIRECT_DB_ENABLED", "true");
  vi.stubEnv("SUPABASE_DB_URL", "postgresql://127.0.0.1:54322/postgres");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Any statement will do: none of these ever reaches the database. */
const ANY_QUERY = "select 1";

/**
 * NONE OF THE URLS BELOW CARRIES CREDENTIALS, AND THAT IS DELIBERATE. The guard
 * reads `new URL(...).hostname` and nothing else, so a user and password would
 * add no coverage while turning every literal here into a `user:password@host`
 * string that a secret scanner cannot tell from a real one.
 *
 * That is not hypothetical. The first version of this file used the real
 * development project's hostname in that shape and GitGuardian flagged it on the
 * pull request. Nothing had leaked, since the password was the placeholder
 * `postgres` and the project ref is already public in spec 0007's P3, but a
 * scanner cannot know that, and neither can the next reader. It is the same
 * reasoning `.env.test.example` gives for leaving its two keys blank.
 *
 * The hosted example uses a made up project ref for the same reason.
 */

describe("the flag that permits the connection", () => {
  /**
   * THE ONE THAT MATTERS. It defaults to false, so an environment that simply
   * never sets it is refused, which is what makes this safe to exist at all.
   */
  it("refuses when the flag is absent", async () => {
    vi.stubEnv("TEST_DIRECT_DB_ENABLED", undefined);

    await expect(queryAsSuperuser(ANY_QUERY)).rejects.toBeInstanceOf(
      DirectDatabaseDisabledError,
    );
  });

  it("refuses when the flag is explicitly false", async () => {
    vi.stubEnv("TEST_DIRECT_DB_ENABLED", "false");

    await expect(queryAsSuperuser(ANY_QUERY)).rejects.toBeInstanceOf(
      DirectDatabaseDisabledError,
    );
  });

  /**
   * A malformed value is rejected rather than quietly read as false. Reading it
   * as false would fail in the safe direction and still be the wrong shape: the
   * variable would look set and not be. Same reasoning `src/env.ts` gives for
   * every boolean it parses.
   */
  it("refuses a value that is not a boolean at all", async () => {
    vi.stubEnv("TEST_DIRECT_DB_ENABLED", "yes-please");

    await expect(queryAsSuperuser(ANY_QUERY)).rejects.toThrow(/not a boolean/u);
  });

  /**
   * SPEC 0007, AC-13. `DEV_SESSION_ENABLED` has exactly one remaining job,
   * guarding the session mint in `admin.ts`. If this helper ever read it again,
   * switching the mint on would switch on a superuser connection as a side
   * effect, and AC-13's wording would quietly become false.
   */
  it("is not switched on by DEV_SESSION_ENABLED (covers AC-13)", async () => {
    vi.stubEnv("TEST_DIRECT_DB_ENABLED", undefined);
    vi.stubEnv("DEV_SESSION_ENABLED", "true");

    await expect(queryAsSuperuser(ANY_QUERY)).rejects.toBeInstanceOf(
      DirectDatabaseDisabledError,
    );
  });
});

describe("the address it is willing to connect to", () => {
  it("refuses when there is no connection string", async () => {
    vi.stubEnv("SUPABASE_DB_URL", undefined);

    await expect(queryAsSuperuser(ANY_QUERY)).rejects.toThrow(/is not set/u);
  });

  /**
   * THE SECOND ONE THAT MATTERS. A misconfigured environment must not be able to
   * point these tests at a hosted project and start writing to it with full
   * privileges. The flag alone would not stop that, because the flag is set on
   * every machine that runs the suite.
   */
  it.each([
    "postgresql://db.example-project-ref.supabase.co:5432/postgres",
    "postgresql://10.0.0.5:5432/postgres",
    "postgresql://example.com:5432/postgres",
  ])("refuses the non local host in %s", async (url) => {
    vi.stubEnv("SUPABASE_DB_URL", url);

    await expect(queryAsSuperuser(ANY_QUERY)).rejects.toThrow(/not local/u);
  });

  /**
   * THE POSITIVE CASE IS DELIBERATELY NOT HERE. Proving that a local host is
   * ACCEPTED means letting the call past the guard, at which point it opens a
   * real socket, and a unit test that reaches the database is the exact thing
   * spec 0004 **AC-12** arranges the suite order to catch. It would also pass
   * for the wrong reason on a machine with nothing running.
   *
   * That direction is proved on every integration run instead: every test in
   * `test/integration/auth-hook.test.ts` gets through this guard to a real
   * connection, so a host check broken the other way fails there immediately.
   */
});
