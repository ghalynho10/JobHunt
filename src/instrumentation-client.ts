import * as Sentry from "@sentry/nextjs";

import { env } from "@/env";

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: process.env.NODE_ENV !== "test",

  /** Spec 0002, AC-13: see the note in `sentry.server.config.ts`. */
  environment: env.NEXT_PUBLIC_VERCEL_ENV ?? "development",

  /**
   * BINDING RULE 4 and spec 0002 AC-14: one validated value, read by both this
   * file and `sentry.server.config.ts`, so the browser and the server can never
   * sample at two different rates. The release is inferred, for the reason
   * recorded there.
   */
  tracesSampleRate: env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,

  dataCollection: {
    userInfo: false,
    httpBodies: [],
    cookies: false,
  },

  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
