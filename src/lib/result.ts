import * as Sentry from "@sentry/nextjs";

/**
 * The error model from spec 0001, binding rules 2 to 5.
 *
 * Failures are returned as values rather than thrown, so the type system forces
 * the caller to handle them. `failure()` is the only constructor, and it reports
 * to Sentry itself, so there is no way to create a failure that goes unreported.
 */

/**
 * Binding rule 3: how loud a failure is.
 *
 * - `unexpected`: something broke (a timeout, a malformed response, a database
 *   error). Reported to Sentry as an error.
 * - `expected`: the system worked and the answer was no (a validation error, a
 *   usage cap reached, an empty search). Reported at info level.
 *
 * `expected` never means "ignorable". Binding rule 4 alerts on the *share* of
 * attempts that fail, because the reference project's outage was made entirely
 * of correctly classified expected failures.
 */
export type FailureSeverity = "expected" | "unexpected";

/**
 * Binding rule 3: the kind is a member of this union, never a free text string.
 * The Sentry fingerprint is derived from it mechanically, so every instance of
 * one kind groups into a single issue with a live event count. That grouping is
 * what binding rule 4's ratio alert counts against.
 *
 * Adding a kind means adding a member here. Free text would either fragment one
 * kind across many issues or collide two unrelated kinds into one.
 */
export type FailureKind =
  /** No valid session where one is required. */
  | "session_missing"
  /** Untrusted input did not parse at a boundary. */
  | "validation_failed"
  /** The database was unreachable, or rejected the statement. */
  | "database_unavailable"
  /** The query ran and matched nothing, where something was required. */
  | "record_not_found"
  /** A call to something outside this application failed or timed out. */
  | "external_service_failed"
  /** An external service answered, but not in the shape we parse. */
  | "response_malformed"
  /** A gated call type has no cap configured, or only partially. */
  | "usage_gate_misconfigured";

export interface Failure {
  readonly ok: false;
  readonly kind: FailureKind;
  readonly severity: FailureSeverity;
  /** Safe to show a user. Never put a secret or a raw record in here. */
  readonly message: string;
  readonly context: Readonly<Record<string, unknown>> | undefined;
}

export interface Success<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Under `strict`, the value cannot be read without first narrowing the union, so
 * ignoring a failure is a compile error rather than a habit.
 */
export type Result<T> = Success<T> | Failure;

export function success<T>(value: T): Success<T> {
  return { ok: true, value };
}

export interface FailureInput {
  readonly kind: FailureKind;
  readonly severity: FailureSeverity;
  readonly message: string;
  /** Extra detail for the report. Call sites may add context, never opt out. */
  readonly context?: Record<string, unknown>;
  /** The underlying error, when one exists. Kept off the returned value. */
  readonly cause?: unknown;
}

/**
 * Binding rule 2: the only constructor for a failure, and it reports.
 * Binding rule 3: it does not compile without a severity and a kind.
 * Binding rule 4: it marks the active span failed, which is what gives the
 * ratio alert a denominator.
 */
export function failure(input: FailureInput): Failure {
  markActiveSpanFailed(input.kind);
  report(input);

  return {
    ok: false,
    kind: input.kind,
    severity: input.severity,
    message: input.message,
    context: input.context,
  };
}

/**
 * Binding rule 4, first mechanism. Attempts are counted as spans, and a failed
 * span is what separates a failed attempt from a successful one.
 *
 * The named span must open as the FIRST statement of an operation, before any
 * early return, denial or guard clause. Otherwise a total denial outage produces
 * no spans, the ratio has no denominator, and the alert stays silent through
 * exactly the failure it exists to catch.
 */
function markActiveSpanFailed(kind: FailureKind): void {
  Sentry.getActiveSpan()?.setStatus({ code: SPAN_STATUS_ERROR, message: kind });
}

/**
 * Sentry defines this constant but does not re-export it from `@sentry/nextjs`,
 * and reaching into `@sentry/core` would mean importing a package this project
 * never declared. The value is part of the OpenTelemetry span status contract
 * (unset 0, ok 1, error 2), so it is stable rather than an internal detail.
 */
const SPAN_STATUS_ERROR = 2;

function report(input: FailureInput): void {
  Sentry.withScope((scope) => {
    // Binding rule 3: the fingerprint comes from the kind, mechanically.
    scope.setFingerprint(["failure", input.kind]);
    scope.setTag("failure.kind", input.kind);
    scope.setTag("failure.severity", input.severity);

    if (input.context) {
      scope.setContext("failure", input.context);
    }

    if (input.severity === "unexpected") {
      scope.setLevel("error");
      Sentry.captureException(toError(input), {
        tags: { "failure.kind": input.kind },
      });
      return;
    }

    scope.setLevel("info");
    Sentry.captureMessage(input.message, "info");
  });
}

function toError(input: FailureInput): Error {
  if (input.cause instanceof Error) return input.cause;

  const error = new Error(input.message);
  error.name = input.kind;
  if (input.cause !== undefined) error.cause = input.cause;
  return error;
}

export function isFailure<T>(result: Result<T>): result is Failure {
  return !result.ok;
}

/**
 * Binding rule 5: an exception escaping an external boundary call is converted,
 * not left to escape.
 *
 * Anything outside this application (`fetch`, a provider SDK, the database
 * driver) may throw rather than return, and such a throw never passes through
 * `failure()`, so it would carry no severity and no kind. Wrap those calls here.
 *
 * Use this for external boundaries ONLY. A programmer bug should still throw and
 * still reach an error boundary with its stack intact. Funnelling every escaping
 * exception into a return value would swallow real bugs into data, which is the
 * opposite of what this error model is for.
 */
export async function attempt<T>(
  boundary: {
    readonly kind: FailureKind;
    readonly message: string;
    readonly context?: Record<string, unknown>;
  },
  call: () => Promise<T>,
): Promise<Result<T>> {
  try {
    return success(await call());
  } catch (cause) {
    return failure({
      kind: boundary.kind,
      severity: "unexpected",
      message: boundary.message,
      context: boundary.context,
      cause,
    });
  }
}
