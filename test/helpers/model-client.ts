import { z } from "zod";

/**
 * The gate on the one test scenario in this project that spends real vendor
 * money: `callTier()` against a real OpenAI and a real Google call (spec
 * 0012, "Critical test scenarios").
 *
 * MIRRORS `TEST_DIRECT_DB_ENABLED`'s OWN PATTERN (`test/helpers/database.ts`):
 * `z.stringbool()` rejects a malformed value rather than quietly reading it
 * as false, and it defaults to false, so an environment that never sets it
 * runs the ordinary, free path. Read at call time, not at import, so a test
 * can observe both states within one process if it ever needs to.
 */
const enabledSchema = z.stringbool().default(false);

/**
 * Whether `TEST_LIVE_MODEL_CALLS_ENABLED` is set to a truthy value.
 *
 * A malformed value (something that is not a recognised boolean spelling)
 * is treated the same as unset: fail closed, never spend money on a value
 * that does not clearly mean "yes".
 */
export function liveModelCallsEnabled(): boolean {
  const parsed = enabledSchema.safeParse(
    process.env["TEST_LIVE_MODEL_CALLS_ENABLED"],
  );

  return parsed.success && parsed.data;
}
