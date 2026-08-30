import { Client } from "pg";

import { env } from "@/env";

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
 * It reaches a local stack and nothing else. `SUPABASE_DB_URL` is not part of
 * `src/env.ts`'s contract, because nothing the product ships connects to
 * Postgres directly, and adding it there would imply otherwise.
 */

/**
 * Thrown when the connection is asked for outside development.
 *
 * The same guard `admin.ts` uses, for the same reason and read at CALL time:
 * this connects as a superuser role, so it fails closed rather than depending
 * on nobody ever importing it from the wrong place.
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
  if (!env.DEV_SESSION_ENABLED) {
    throw new DirectDatabaseDisabledError("DEV_SESSION_ENABLED is not true.");
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
