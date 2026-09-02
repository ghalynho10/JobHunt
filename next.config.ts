import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

/**
 * The build output directory, overridable for a test server only.
 *
 * WHY THIS EXISTS, because a configurable output path looks like indirection for
 * its own sake. `next dev` takes a lock at `<distDir>/lock` and refuses to start
 * a second server in the same directory. Spec 0010 AC-14 drives a Server Action
 * over real HTTP, which needs a server of its own, and that test would otherwise
 * fail for anybody who happened to have `pnpm dev` running.
 *
 * IT IS ABSENT UNLESS THE VARIABLE IS SET, so production and CI builds are byte
 * for byte what they were: the key is not present in the config object at all,
 * rather than present and undefined. Only `test/helpers/app-server.ts` sets it.
 *
 * This is production configuration shaped by testability, which is worth naming
 * rather than hiding. It is the same trade `src/lib/supabase/server.ts` records
 * for its optional cookie adapter.
 */
const distDir = process.env.NEXT_DIST_DIR;

const nextConfig: NextConfig = {
  typescript: {
    // A type error fails the build. Spec 0001 leans on the type system to make
    // an unhandled failure impossible, so shipping past one would defeat it.
    ignoreBuildErrors: false,
  },
  ...(distDir === undefined ? {} : { distDir }),
};

/**
 * These three are build time only: the Sentry plugin reads them while bundling,
 * long before `src/env.ts` is ever imported, so they are not part of the
 * validated runtime surface. All are optional, and without them the build simply
 * skips source map upload rather than failing.
 */
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
