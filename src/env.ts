import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Validated environment variables (spec 0001, "Environment config").
 *
 * A missing or malformed variable fails the build rather than surfacing as a
 * confusing runtime error. Importing a `server` value from client code is a
 * build error, which is what keeps the secret key out of the browser.
 */
export const env = createEnv({
  server: {
    /**
     * The Supabase secret key (`sb_secret_...`). It carries BYPASSRLS and skips
     * every policy, so binding rule 1 allows exactly one module to read it:
     * `src/lib/supabase/secret.ts`. Nothing else may import this value.
     */
    SUPABASE_SECRET_KEY: z.string().min(1),
    SENTRY_DSN: z.url().optional(),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
  },
  /**
   * Next.js only inlines variables it can see written out literally, so the
   * client values have to be spelled out rather than read from a loop.
   */
  runtimeEnv: {
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  },
  /** An empty string in a `.env` file means "not set", not "set to nothing". */
  emptyStringAsUndefined: true,
  /**
   * Linting and Docker builds run without real secrets. Set SKIP_ENV_VALIDATION
   * for those; never set it for a real build or a real boot.
   */
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
