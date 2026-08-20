import * as Sentry from "@sentry/nextjs";

import { env } from "@/env";

Sentry.init({
  dsn: env.NEXT_PUBLIC_SENTRY_DSN,

  enabled: process.env.NODE_ENV !== "test",

  /** BINDING RULE 4: see the note in `sentry.server.config.ts`. */
  tracesSampleRate: 1,

  dataCollection: {
    userInfo: false,
    httpBodies: [],
    cookies: false,
  },

  debug: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
