/**
 * Loads `.env.test` into `process.env` before anything reads it.
 *
 * This is listed FIRST in `setupFiles` on purpose, and it is its own module for
 * the same reason: `src/env.ts` validates the whole environment contract the
 * moment it is imported, so the values have to be present before any test file,
 * helper, or other setup file pulls it in.
 *
 * The file genuinely has to exist for the integration project, because the
 * session mint needs a real `SUPABASE_SECRET_KEY` (spec 0004, "Configuration
 * required"). `SKIP_ENV_VALIDATION` is NOT the alternative: it would let a run
 * start with the key undefined and fail deep inside the mint instead, which is
 * exactly the silent failure shape the error model exists to prevent.
 */
import { existsSync } from "node:fs";

const ENV_FILE = ".env.test";

/**
 * `process.loadEnvFile` does NOT overwrite a variable that is already set, which
 * is the behaviour this wants: CI passes the local stack's fixed development
 * values in as real environment variables and never writes this file, while a
 * developer keeps them in `.env.test`. Neither one has to know about the other.
 *
 * A missing file is not an error here. It only means the values are expected to
 * arrive from the environment instead, and if they did not, `src/env.ts` fails
 * loudly and by name, which is a better error than anything this file could
 * invent.
 */
if (existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}
