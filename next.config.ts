import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // A type error fails the build. Spec 0001 leans on the type system to make
    // an unhandled failure impossible, so shipping past one would defeat it.
    ignoreBuildErrors: false,
  },
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
