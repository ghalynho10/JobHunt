import { createRequire } from "node:module";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { capturedEvents } from "../../test/setup/sentry-transport";

import {
  attempt,
  failure,
  isFailure,
  success,
  type FailureKind,
} from "./result";

/**
 * Spec 0004, AC-10: the reporting contract is PROVED, not assumed.
 *
 * `failure()` reports to Sentry from inside itself (binding rule 2), which is
 * what makes an unreported failure impossible to write. That guarantee is only
 * worth anything if the report it produces is actually the right shape, and
 * nothing checked that until this file.
 *
 * The whole point of the in memory transport is visible here: with the SDK left
 * uninitialised instead, every assertion below would pass against zero captured
 * events and prove nothing whatsoever.
 */

/**
 * The other half of AC-10: nothing leaves the process.
 *
 * The transport already implies it, since Sentry hands each envelope to exactly
 * one transport and ours is installed. This checks it the other way round, at
 * the two places a request could actually be made, so the claim rests on
 * observed behaviour rather than on that reasoning being right.
 *
 * `createRequire` is used deliberately: an ESM namespace for a builtin exposes
 * its members as read only getters, so they cannot be replaced, while the CommonJS
 * object is an ordinary mutable object.
 */
const require = createRequire(import.meta.url);
const http = require("node:http");
const https = require("node:https");

const outboundHosts: string[] = [];

function hostOf(target: unknown): string {
  if (typeof target === "string") {
    try {
      return new URL(target).host;
    } catch {
      return target;
    }
  }
  if (target instanceof URL) return target.host;
  if (target && typeof target === "object") {
    const options = target as { host?: string; hostname?: string };
    return options.hostname ?? options.host ?? "";
  }
  return "";
}

const realFetch = globalThis.fetch;
const realHttpRequest = http.request;
const realHttpsRequest = https.request;

beforeEach(() => {
  outboundHosts.length = 0;

  globalThis.fetch = ((input: unknown, init?: unknown) => {
    outboundHosts.push(hostOf(input));
    return realFetch(input as RequestInfo, init as RequestInit | undefined);
  }) as typeof globalThis.fetch;

  http.request = (...args: unknown[]) => {
    outboundHosts.push(hostOf(args[0]));
    return realHttpRequest(...args);
  };
  https.request = (...args: unknown[]) => {
    outboundHosts.push(hostOf(args[0]));
    return realHttpsRequest(...args);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
  http.request = realHttpRequest;
  https.request = realHttpsRequest;
});

function reachedSentry(): readonly string[] {
  return outboundHosts.filter((host) => host.includes("sentry.io"));
}

describe("failure() reporting contract", () => {
  it("reports an unexpected failure at error level, fingerprinted by kind", async () => {
    const kind: FailureKind = "database_unavailable";

    failure({
      kind,
      severity: "unexpected",
      message: "Could not reach the database.",
    });

    const [event, ...rest] = await drainEvents();

    expect(rest).toHaveLength(0);
    expect(event).toBeDefined();
    // Binding rule 3: the fingerprint is derived from the kind, mechanically,
    // so every instance of one kind groups into a single issue. That grouping
    // is what binding rule 4's ratio alert counts against.
    expect(event?.fingerprint).toEqual(["failure", kind]);
    expect(event?.tags).toMatchObject({
      "failure.kind": kind,
      "failure.severity": "unexpected",
    });
    expect(event?.level).toBe("error");
  });

  it("reports an expected failure at info level, fingerprinted by kind", async () => {
    const kind: FailureKind = "record_not_found";

    failure({
      kind,
      severity: "expected",
      message: "No profile exists for this user yet.",
    });

    const [event, ...rest] = await drainEvents();

    expect(rest).toHaveLength(0);
    expect(event).toBeDefined();
    expect(event?.fingerprint).toEqual(["failure", kind]);
    expect(event?.tags).toMatchObject({
      "failure.kind": kind,
      // `expected` never means ignorable. It means the system worked and the
      // answer was no, which is why it is reported at all rather than dropped.
      "failure.severity": "expected",
    });
    expect(event?.level).toBe("info");
  });

  it("carries the kind on the reported error, not just on the tag", async () => {
    failure({
      kind: "response_malformed",
      severity: "unexpected",
      message: "The profile row did not match the shape we parse.",
    });

    const [event] = await drainEvents();

    // `toError()` names the synthesised error after the kind, so the issue
    // title in Sentry reads as the kind rather than as a bare "Error".
    expect(event?.exceptionType).toBe("response_malformed");
    expect(event?.exceptionValue).toBe(
      "The profile row did not match the shape we parse.",
    );
  });

  it("sends nothing to a Sentry ingest host", async () => {
    failure({
      kind: "external_service_failed",
      severity: "unexpected",
      message: "The provider did not answer.",
    });

    await drainEvents();

    expect(reachedSentry()).toEqual([]);
  });

  it("sets the kind as a queryable span attribute, not just the status message (spec 0011, AC-10)", async () => {
    /**
     * The status message alone cannot back an alert query: verified in Sentry
     * on 2026-09-02 against a real forced failure, a failed span carries
     * `span.status: internal_error` in the dashboard and nothing naming which
     * kind failed (`docs/experiments/0011-usage-gating-and-kill-switch.md`).
     * The attribute is what a rule actually filters on, so this asserts the
     * attribute directly rather than trusting that setting the status implies
     * it.
     */
    const Sentry = await import("@sentry/nextjs");

    await Sentry.startSpan({ name: "test.span", op: "function" }, () => {
      const span = Sentry.getActiveSpan();

      if (!span) {
        throw new Error("Expected an active span inside startSpan's callback.");
      }

      const setAttribute = vi.spyOn(span, "setAttribute");
      const setStatus = vi.spyOn(span, "setStatus");

      failure({
        kind: "usage_gate_misconfigured",
        severity: "unexpected",
        message:
          "This kind of search isn't switched on yet. Try again another time.",
      });

      expect(setAttribute).toHaveBeenCalledWith(
        "failure.kind",
        "usage_gate_misconfigured",
      );
      // The status still has to be set too: it is what marks the span failed
      // at all, which is the ratio's denominator. Neither replaces the other.
      expect(setStatus).toHaveBeenCalledWith(
        expect.objectContaining({ message: "usage_gate_misconfigured" }),
      );
    });

    await drainEvents();
  });

  it("reports once per failure, never twice", async () => {
    failure({
      kind: "session_missing",
      severity: "expected",
      message: "No session is present for this read.",
    });
    failure({
      kind: "session_missing",
      severity: "expected",
      message: "No session is present for this read.",
    });

    expect(await drainEvents()).toHaveLength(2);
  });
});

describe("attempt()", () => {
  it("converts a thrown exception into a reported failure value", async () => {
    const result = await attempt(
      {
        kind: "external_service_failed",
        message: "Could not verify the session.",
      },
      () => Promise.reject(new Error("socket hang up")),
    );

    expect(isFailure(result)).toBe(true);
    // Binding rule 5: an exception escaping an external boundary is converted,
    // never left to escape, and the conversion goes through `failure()`, so it
    // is reported like any other.
    const [event] = await drainEvents();
    expect(event?.fingerprint).toEqual(["failure", "external_service_failed"]);
    expect(event?.level).toBe("error");
    // The original error is kept as the reported exception, so its stack
    // survives rather than being replaced by a synthesised one.
    expect(event?.exceptionValue).toBe("socket hang up");
  });

  it("reports nothing when the call succeeds", async () => {
    const result = await attempt(
      { kind: "external_service_failed", message: "unused" },
      () => Promise.resolve(42),
    );

    expect(result).toEqual(success(42));
    expect(await drainEvents()).toHaveLength(0);
  });
});

/**
 * Sentry batches envelopes on a short timer, so an assertion made immediately
 * after `failure()` would race it. Flushing forces the client to hand
 * everything to the transport first.
 */
async function drainEvents() {
  const Sentry = await import("@sentry/nextjs");
  await Sentry.flush(2_000);
  return capturedEvents();
}
