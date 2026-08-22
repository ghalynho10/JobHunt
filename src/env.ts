import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Validated environment variables (spec 0001 "Environment config", extended by
 * spec 0002 "Configuration required").
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
    /**
     * Optional here and demanded by `createFinalSchema` below on any deployed
     * build. See the note there: spec 0002 AC-13 exists because a deploy with no
     * DSN would otherwise succeed and ship with error reporting silently off.
     */
    SENTRY_DSN: z.url().optional(),
    /**
     * Spec 0002 AC-10: the development only password sign in is permitted only
     * where this is explicitly true. It defaults to false, so an environment
     * that simply does not set it (production) fails closed, and neither guard
     * depends any longer on how a build labels `NODE_ENV`.
     *
     * `z.stringbool()` rejects a malformed value rather than quietly reading it
     * as false, which would be a silent failure in the safe direction and still
     * the wrong shape: the variable would look set and not be.
     */
    DEV_SESSION_ENABLED: z.stringbool().default(false),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
    /**
     * The canonical site URL: always the production origin, in every
     * environment, including locally. It is NOT the origin a request is being
     * served from, which is `currentOrigin()` in `src/lib/origin.ts`. Spec 0002,
     * "Site URL: two values, two jobs": neither can quietly stand in for the
     * other, so both are named rather than derived from each other.
     */
    NEXT_PUBLIC_SITE_URL: z.url(),
    /**
     * Spec 0002 AC-14. Binding rule 4 needs 1.0 wherever the failure ratio alert
     * runs, which is production; previews run lower so they do not compete for
     * the same quota. Read from here rather than hardcoded in the two Sentry
     * config files, so the two can never drift apart.
     */
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: z.coerce
      .number()
      .min(0)
      .max(1)
      .default(1),
    /**
     * Vercel's framework prefixed system values. All three are optional, and
     * absent means this is not a Vercel deployment (local work, or CI).
     *
     * Verified on 2026-08-21 against Vercel's framework environment variables
     * reference: for the Next.js preset all three names exist, are populated
     * when "Enable access to System Environment Variables" is on, and are
     * available at both build time and runtime. This settles spec 0002's open
     * follow-up, so no explicit per environment fallback variable is needed.
     *
     * The two URL values carry no protocol scheme, which is why `origin.ts` adds
     * `https://` rather than using them as they arrive.
     */
    NEXT_PUBLIC_VERCEL_ENV: z
      .enum(["production", "preview", "development"])
      .optional(),
    NEXT_PUBLIC_VERCEL_BRANCH_URL: z.string().min(1).optional(),
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: z.string().min(1).optional(),
  },
  /**
   * Next.js only inlines variables it can see written out literally, so the
   * client values have to be spelled out rather than read from a loop.
   */
  runtimeEnv: {
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SENTRY_DSN: process.env.SENTRY_DSN,
    DEV_SESSION_ENABLED: process.env.DEV_SESSION_ENABLED,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE:
      process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
    NEXT_PUBLIC_VERCEL_BRANCH_URL: process.env.NEXT_PUBLIC_VERCEL_BRANCH_URL,
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA:
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  },
  /**
   * Spec 0002 AC-13: the two Sentry DSNs are conditionally required rather than
   * plainly optional. Optional when `NEXT_PUBLIC_VERCEL_ENV` is absent, which is
   * local work and a fresh clone before anyone has a Sentry project. Required
   * the moment this is a deployment.
   *
   * Without this a deployed build with no DSN succeeds, ships with reporting
   * off, and leaves AC-13 passing on paper while nothing reports, which is the
   * exact failure shape the whole error model exists to prevent.
   *
   * `isServer` is load bearing: env core builds the client shape without the
   * server variables in it, so `SENTRY_DSN` exists to be demanded only on the
   * server pass. Demanding it on both would fail every client parse.
   */
  createFinalSchema: (shape, isServer) =>
    z.object(shape).superRefine((parsed, ctx) => {
      const values: Readonly<Record<string, unknown>> = parsed;

      if (values["NEXT_PUBLIC_VERCEL_ENV"] === undefined) return;

      const required = isServer
        ? ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"]
        : ["NEXT_PUBLIC_SENTRY_DSN"];

      for (const name of required) {
        if (values[name] !== undefined) continue;

        ctx.addIssue({
          code: "custom",
          path: [name],
          message: `${name} is required on a deployed build (spec 0002, AC-13). Without it the deployment ships with error reporting switched off and nothing says so.`,
        });
      }
    }),
  /** An empty string in a `.env` file means "not set", not "set to nothing". */
  emptyStringAsUndefined: true,
  /**
   * Spec 0002, invariant 2: this exists for the CI job that holds no secrets,
   * and nowhere else. A deployed build must never set it, or a missing variable
   * boots into a confusing runtime error instead of failing the build by name.
   */
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
});
