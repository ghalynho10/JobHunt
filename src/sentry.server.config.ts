import * as Sentry from "@sentry/nextjs";

import { env } from "@/env";

Sentry.init({
  dsn: env.SENTRY_DSN,

  /**
   * Spec 0001 follow-up: `failure()` reports from inside itself, so without this
   * the first test run would report every deliberately provoked failure and burn
   * quota. A missing DSN also leaves the SDK inert, which is what keeps a fresh
   * clone runnable before anyone has a Sentry project.
   */
  enabled: process.env.NODE_ENV !== "test",

  /**
   * Spec 0002, AC-13. Every event carries the environment it came from, so a
   * preview's noise never reads as a production incident. Absent means this is
   * not a Vercel deployment, which is local work.
   */
  environment: env.NEXT_PUBLIC_VERCEL_ENV ?? "development",

  /**
   * The release is deliberately NOT set here.
   *
   * Checked on 2026-08-21 in the installed packages rather than assumed:
   * `@sentry/node-core` 10.70.0 (`getSentryRelease`) and
   * `@sentry/bundler-plugin-core` 5.3.0 both already fall back to
   * `VERCEL_GIT_COMMIT_SHA`, which Vercel populates at build and at runtime. So
   * a deployed event is tagged with the deployed commit without configuration.
   * Setting it again by hand would be the same value written twice, with two
   * chances to drift, which is what spec 0002's follow-up warned about.
   */

  /**
   * BINDING RULE 4: trace sampling must be 1.0 on any operation whose failure
   * rate is alerted on, and spec 0002 AC-14 reads it from validated
   * configuration rather than hardcoding it in two files that can drift.
   * Production and local are 1; Vercel Preview is 0.1 so hand driven previews do
   * not compete for the quota the ratio alert depends on.
   */
  tracesSampleRate: env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,

  /**
   * The database holds real resumes and personal details. Nothing personally
   * identifying goes to Sentry unless a decision is recorded about it.
   */
  dataCollection: {
    userInfo: false,
    /** An empty array disables body collection. Profiles and resumes live there. */
    httpBodies: [],
    /** The session token is a cookie. None of them need to reach Sentry. */
    cookies: false,
  },

  debug: false,
});
