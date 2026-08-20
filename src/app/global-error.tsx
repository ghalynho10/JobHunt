"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * The last resort boundary: an error thrown out of the root layout itself.
 *
 * Binding rule 5 deliberately lets a programmer bug throw rather than converting
 * it into a value, so something has to catch it and say so out loud. A blank page
 * would be exactly the silent failure the spec rules out.
 */
export default function GlobalError({ error }: { error: Error }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main>
          <h1>Something broke</h1>
          <p>
            This page failed to render. The error has been reported. Reload to
            try again.
          </p>
        </main>
      </body>
    </html>
  );
}
