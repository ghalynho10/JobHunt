import * as Sentry from "@sentry/nextjs";
import type { Event } from "@sentry/nextjs";

/**
 * `@sentry/nextjs` exports the `Event` type but not `Transport` or `Envelope`,
 * and reaching into `@sentry/core` for them would mean importing a package this
 * project never declared, the same call `src/lib/result.ts` makes about
 * `SPAN_STATUS_ERROR`. Both are derived from the public `init` signature
 * instead, so they cannot drift from the SDK this project actually installs.
 */
type TransportFactory = NonNullable<
  Parameters<typeof Sentry.init>[0]["transport"]
>;
type Transport = ReturnType<TransportFactory>;
type Envelope = Parameters<Transport["send"]>[0];

/**
 * The in memory Sentry transport (spec 0004, AC-10).
 *
 * Nothing leaves the process during a test run, AND the reporting contract is
 * proved rather than assumed. Those are two requirements, not one, and only a
 * real transport satisfies both.
 *
 * Leaving the SDK uninitialised would satisfy the first and quietly destroy the
 * second: `failure()` reports from inside itself (binding rule 2), so with no
 * client every assertion about a captured event would pass while proving
 * nothing at all. A transport is the last stop before the network, so capturing
 * here proves both that the event was built correctly and that it never left.
 */

/**
 * One captured event, flattened out of its envelope so a test can read it
 * without knowing the envelope format.
 */
export interface CapturedEvent {
  readonly level: Event["level"];
  readonly fingerprint: readonly string[] | undefined;
  readonly tags: Readonly<Record<string, unknown>> | undefined;
  readonly message: string | undefined;
  readonly exceptionType: string | undefined;
  readonly exceptionValue: string | undefined;
}

const captured: CapturedEvent[] = [];

/**
 * Every event the SDK tried to send since the last reset, oldest first.
 *
 * Returned as a copy: a test that held the live array could watch it change
 * underneath its own assertions.
 */
export function capturedEvents(): readonly CapturedEvent[] {
  return [...captured];
}

/** Called between tests, so one test can never read another's events. */
export function resetCapturedEvents(): void {
  captured.length = 0;
}

/**
 * A Sentry envelope is `[header, items]`, and each item is
 * `[itemHeader, payload]`. The payload is still a live JavaScript object at
 * this point: serialisation happens inside the real transport, downstream of
 * here, which is the reason this hook can read the event at all.
 */
function collect(envelope: Envelope): void {
  const [, items] = envelope;

  for (const item of items) {
    const [itemHeader, payload] = item;

    // Transactions, sessions and client reports also travel as envelope items.
    // Only error and message events carry the failure contract under test.
    if (itemHeader.type !== "event") continue;

    const event = payload as Event;
    const exception = event.exception?.values?.[0];

    captured.push({
      level: event.level,
      fingerprint: event.fingerprint,
      tags: event.tags,
      message: typeof event.message === "string" ? event.message : undefined,
      exceptionType: exception?.type,
      exceptionValue: exception?.value,
    });
  }
}

/**
 * A transport that records and answers, and never opens a socket.
 *
 * It reports success back to the SDK so the client behaves exactly as it would
 * in production; a transport that rejected would exercise the SDK's retry path
 * instead of the reporting path this is here to prove.
 */
function inMemoryTransport(): Transport {
  return {
    send: (envelope: Envelope) => {
      collect(envelope);
      return Promise.resolve({ statusCode: 200 });
    },
    flush: () => Promise.resolve(true),
  };
}

/**
 * The DSN is syntactically real and points nowhere real.
 *
 * A DSN has to parse or the SDK stays inert and captures nothing, which would
 * put us back at the uninitialised case above. `o0.ingest.sentry.io` with
 * public key `0` is not a project anyone owns, and the transport above means no
 * request is ever made to it regardless.
 */
const OFFLINE_DSN = "https://0@o0.ingest.sentry.io/0";

/**
 * Installs the transport. Called once per test file by the Vitest setup.
 *
 * `src/sentry.server.config.ts` switches the SDK OFF under `NODE_ENV=test`,
 * which is correct for the application: it stops a test run reporting every
 * deliberately provoked failure to the real project. This is a separate,
 * deliberate init that replaces the destination rather than removing it.
 */
export function installInMemorySentry(): void {
  Sentry.init({
    dsn: OFFLINE_DSN,
    enabled: true,
    transport: inMemoryTransport,
    /** Traces are irrelevant here and would only add envelopes to sift. */
    tracesSampleRate: 0,
    /**
     * Default integrations reach for the filesystem and the process, and one of
     * them (`OnUncaughtException`) installs a handler that would swallow a
     * failing test's own error. None of them are part of the contract AC-10
     * asserts.
     */
    defaultIntegrations: false,
  });
}
