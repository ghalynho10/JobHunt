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
   * BINDING RULE 4: trace sampling must be 1.0 on any operation whose failure
   * rate is alerted on. A sampled ratio at this traffic volume is noise, not a
   * signal. Revisit only if volume ever grows.
   */
  tracesSampleRate: 1,

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
