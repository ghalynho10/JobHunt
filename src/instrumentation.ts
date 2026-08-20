import * as Sentry from "@sentry/nextjs";

export async function register() {
  /**
   * Spec 0001 chose the Node runtime over Edge for hosting, and Next.js 16 runs
   * `proxy.ts` on Node too, so there is no edge runtime in this application and
   * no `sentry.edge.config.ts` to load. If an edge runtime is ever introduced,
   * that decision belongs in the spec first, and this file needs a branch for it.
   */
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}

/**
 * Catches errors thrown out of Server Components, Server Actions, route handlers
 * and the proxy. This is the escape hatch for the programmer bugs that binding
 * rule 5 deliberately lets throw rather than converting into a value.
 */
export const onRequestError = Sentry.captureRequestError;
