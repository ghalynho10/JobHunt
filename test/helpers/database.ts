import { Client } from "pg";
import { z } from "zod";

/**
 * A privileged direct connection to the local Postgres, for the test layer only
 * (spec 0007, build plan step 11).
 *
 * WHY THIS EXISTS AT ALL, since the project already has a secret key client.
 * Spec 0007's refusal hook is deliberately unreachable from the Data API: its
 * `execute` is revoked from `public` and granted to `supabase_auth_admin` alone,
 * so `service_role` gets `permission denied for function` and the Supabase
 * client cannot call it. That is the security property, and weakening the grant
 * so a test could reach it would be testing a different function from the one
 * that ships.
 *
 * Nor can the hook's refusal branch be driven through GoTrue's own signup
 * endpoint: a second signup for an address that already exists is answered with
 * `user_already_exists` BEFORE the hook is consulted, confirmed against the
 * running stack on 2026-08-30. So the only honest way to prove the function's
 * decisions is to call the real function in the real database.
 *
 * IT LIVES UNDER `test/`, OUTSIDE `src/`, for the same structural reason
 * `admin.ts` does: no application module can import a test helper if the helper
 * is not in the application's module graph at all.
 *
 * It reaches a local stack and nothing else. Neither `SUPABASE_DB_URL` nor the
 * flag below is part of `src/env.ts`'s contract, because nothing the product
 * ships connects to Postgres directly and adding either there would imply
 * otherwise.
 *
 * IT HAS ITS OWN FLAG RATHER THAN READING `DEV_SESSION_ENABLED`, and that is a
 * correctness point, not a preference. Spec 0007 **AC-13** says in terms that
 * `DEV_SESSION_ENABLED` survives with EXACTLY ONE remaining job, guarding the
 * session mint in `admin.ts`, and `src/env.ts`'s comment says the same. A second
 * reader here would have made both statements false, and the cheap fix would
 * have been to reword an accepted criterion to match the code rather than the
 * other way round. Two guards for two different privileged paths also fail
 * independently, which is what you want: switching the mint on should not switch
 * on a superuser connection as a side effect.
 */

/**
 * The guard, parsed rather than read.
 *
 * `z.stringbool()` rejects a malformed value instead of quietly treating it as
 * false, the same reasoning `src/env.ts` gives for every boolean it parses: a
 * silent failure in the safe direction is still the wrong shape, because the
 * variable would look set and not be.
 *
 * It defaults to false, so an environment that never sets it is refused.
 */
const enabledSchema = z.stringbool().default(false);

/**
 * Thrown when the connection is asked for outside development.
 *
 * Its own guard, not `admin.ts`'s, for the reason given above, but read at CALL
 * time exactly as that one is. Read at import, a test could never observe the
 * refusal without a separate process, and the guard would go unproved.
 *
 * It throws rather than returning a `failure()`: binding rule 2 is about the
 * application's own expected failures, and asking for a superuser connection
 * where one is not permitted is a programmer bug, which should keep its stack.
 */
export class DirectDatabaseDisabledError extends Error {
  constructor(reason: string) {
    super(
      `No direct database connection may be opened: ${reason} This path connects with full privileges and is for the local stack only.`,
    );
    this.name = "DirectDatabaseDisabledError";
  }
}

/**
 * Opens a connection, runs one query, and always closes it.
 *
 * A connection per call rather than a shared pool. These tests make a handful of
 * queries each, a pool left open keeps Vitest's process alive after the run, and
 * nothing here is hot enough for the difference to matter.
 *
 * @param sql The statement, with `$1` style placeholders.
 * @param values The bound values. Never interpolate into `sql`.
 */
export async function queryAsSuperuser<T>(
  sql: string,
  values: readonly unknown[] = [],
): Promise<readonly T[]> {
  const enabled = enabledSchema.safeParse(
    process.env["TEST_DIRECT_DB_ENABLED"],
  );

  if (!enabled.success) {
    throw new DirectDatabaseDisabledError(
      "TEST_DIRECT_DB_ENABLED is set to something that is not a boolean.",
    );
  }

  if (!enabled.data) {
    throw new DirectDatabaseDisabledError(
      "TEST_DIRECT_DB_ENABLED is not true.",
    );
  }

  const connectionString = process.env["SUPABASE_DB_URL"];

  if (connectionString === undefined || connectionString === "") {
    throw new DirectDatabaseDisabledError("SUPABASE_DB_URL is not set.");
  }

  /**
   * Refuses anything that is not a local address, so a misconfigured
   * environment cannot point these tests at a hosted project and start writing
   * to it with full privileges.
   */
  const host = new URL(connectionString).hostname;

  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new DirectDatabaseDisabledError(`the host is ${host}, not local.`);
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    const result = await client.query(sql, [...values]);
    return result.rows as readonly T[];
  } finally {
    await client.end();
  }
}
