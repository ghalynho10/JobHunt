import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import type { ServiceDeclaration } from "./services";

/**
 * Record and replay for external services (spec 0004, AC-2, AC-8, AC-9, AC-13).
 *
 * A test exercises a real recorded response, captured once from the real
 * service, instead of a hand written mock. That is the whole point: the
 * reference project's worst bug survived six passing tests that all mocked the
 * same wrong assumption, and a mock is free to agree with the code it is
 * meant to be checking. A recording cannot: it is what the service actually
 * sent.
 *
 * Bespoke rather than off the shelf, because nothing does exactly this, which
 * spec 0004 names as an accepted cost.
 */

/** The placeholder every redacted value becomes. Fixed, so a diff is obvious. */
export const REDACTED = "[redacted]";

/**
 * Parsed at its boundary like any other untrusted input, per the project rule.
 * Defaults to `replay`, so a run that says nothing never reaches the network.
 */
const modeSchema = z.enum(["record", "replay"]).default("replay");

export type FixtureMode = z.infer<typeof modeSchema>;

export function fixtureMode(): FixtureMode {
  const parsed = modeSchema.safeParse(process.env["TEST_FIXTURE_MODE"]);

  if (parsed.success) return parsed.data;

  /**
   * An unrecognised value is refused rather than quietly read as `replay`.
   * Falling back would be a silent failure in the safe direction and still the
   * wrong shape: someone who typed `TEST_FIXTURE_MODE=recording` expecting to
   * capture would watch the suite pass against stale files and never learn why.
   */
  throw new Error(
    `TEST_FIXTURE_MODE is "${process.env["TEST_FIXTURE_MODE"] ?? ""}", which is neither "record" nor "replay". Leave it unset to replay from the committed recordings.`,
  );
}

const FIXTURE_ROOT = fileURLToPath(new URL("../fixtures/", import.meta.url));

export function fixturePath(service: ServiceDeclaration, name: string): string {
  return join(FIXTURE_ROOT, service.name, `${name}.json`);
}

/**
 * What a recording holds.
 *
 * The body is kept as a RAW STRING rather than as parsed JSON, deliberately. A
 * recording exists to be byte for byte what the service sent; parsing it on the
 * way in and re-serialising it on the way out would quietly normalise key
 * order, number formatting and whitespace, and the file would no longer be
 * evidence of anything. Callers parse it themselves, at their own boundary.
 */
const recordingSchema = z.object({
  recordedFrom: z.object({
    method: z.string(),
    url: z.url(),
    headers: z.record(z.string(), z.string()),
  }),
  response: z.object({
    status: z.number().int(),
    headers: z.record(z.string(), z.string()),
    bodyText: z.string(),
  }),
});

export type Recording = z.infer<typeof recordingSchema>;

/**
 * Replaces every header value except those the service allows, keeping the
 * names. Case is normalised first, because HTTP header names are case
 * insensitive and an allow list that missed `Set-Cookie` while catching
 * `set-cookie` would be worse than no allow list at all.
 */
function redactHeaders(
  headers: Readonly<Record<string, string>>,
  service: ServiceDeclaration,
): Record<string, string> {
  const allowed = new Set(
    service.keepHeaders.map((name) => name.toLowerCase()),
  );
  const redacted: Record<string, string> = {};

  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    redacted[key] = allowed.has(key) ? value : REDACTED;
  }

  return redacted;
}

/** Blanks the declared credential carrying query parameters, keeping the shape. */
function redactUrl(url: string, service: ServiceDeclaration): string {
  const parsed = new URL(url);

  for (const param of service.secretQueryParams) {
    if (parsed.searchParams.has(param))
      parsed.searchParams.set(param, REDACTED);
  }

  /**
   * The fragment is dropped whole, rather than scanned. A fragment is never
   * sent to the server, so it is not part of what the service received and
   * nothing legitimate is lost by removing it. It is also where the OAuth
   * implicit grant puts `access_token`, and `secretQueryParams` has no
   * equivalent for it, so scanning would need a second declaration to keep
   * correct. Dropping needs none and cannot be incomplete.
   */
  parsed.hash = "";

  return parsed.toString();
}

/**
 * Thrown when a body cannot be scanned for the credentials its service declares.
 *
 * A named class so a caller can tell this apart from a transport failure. It is
 * thrown, not returned: being unable to honour a redaction declaration is a
 * programmer level mistake in the service declaration, not an expected outcome
 * of recording.
 */
export class UnscannableBodyError extends Error {
  constructor(serviceName: string, reason: string) {
    super(
      `Refusing to write a recording for "${serviceName}": ${reason}. This service declares credential carrying body fields, and a body that cannot be parsed cannot be scanned for them, so writing it would commit an unchecked body to git. Either widen the service's declaration to describe this body, or record this response by hand after removing the credential.`,
    );
    this.name = "UnscannableBodyError";
  }
}

/**
 * Replaces every declared credential field, AT ANY DEPTH, in a parsed body.
 *
 * REBUILT RATHER THAN MUTATED IN PLACE, per the project's immutability rule.
 * The earlier version assigned into the parsed object, which also meant the
 * caller's value changed under it.
 *
 * Matching is by key name wherever it appears, not by a path. A path would have
 * to be declared per service and would silently miss the one shape nobody
 * predicted, which is the failure this function exists to prevent. Matching by
 * name can only ever redact MORE than strictly needed, and over redaction costs
 * a reviewer some context while under redaction commits a credential.
 */
function redactValue(value: unknown, fields: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry, fields));
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        fields.has(key) ? REDACTED : redactValue(entry, fields),
      ]),
    );
  }

  return value;
}

/**
 * Blanks the declared credential carrying body fields.
 *
 * FAILS LOUDLY RATHER THAN SILENTLY PASSING A BODY THROUGH. The earlier version
 * returned the body untouched whenever it was not a flat top level object: a
 * top level array, a non JSON body, or a credential nested one level down all
 * came out unredacted, with no signal that nothing had been scanned. The
 * warning printed the same words either way, so a reviewer skimming a large
 * payload had no way to tell a scanned body from an unscanned one. That is the
 * silent failure the project's own rule forbids, and it undoes AC-13 for
 * exactly the response shapes a real service is most likely to send.
 *
 * Arrays and nesting are now handled by `redactValue`. A body that is not JSON
 * at all still cannot be scanned, so this refuses to produce a recording rather
 * than pretend, the same way `fixtureMode()` refuses an unrecognised mode
 * instead of guessing at `replay`.
 *
 * A service that declares no credential carrying fields is saying its bodies
 * never hold one, so its bodies are returned untouched and unparsed.
 */
function redactBody(bodyText: string, service: ServiceDeclaration): string {
  if (service.secretBodyFields.length === 0) return bodyText;

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new UnscannableBodyError(
      service.name,
      "the response body is not JSON, so its declared credential fields cannot be found",
    );
  }

  return JSON.stringify(redactValue(parsed, new Set(service.secretBodyFields)));
}

/**
 * AC-13: redaction happens AT WRITE TIME, not at read time.
 *
 * The difference is the whole guarantee. Redacting on read would leave the
 * credential sitting in the file in git, which is precisely the thing that must
 * never happen. By the time anything is written to disk the secret is already
 * gone.
 *
 * Exported so the redaction can be driven directly as well as through a real
 * capture.
 */
export function redact(
  recording: Recording,
  service: ServiceDeclaration,
): Recording {
  return {
    recordedFrom: {
      method: recording.recordedFrom.method,
      url: redactUrl(recording.recordedFrom.url, service),
      headers: redactHeaders(recording.recordedFrom.headers, service),
    },
    response: {
      status: recording.response.status,
      headers: redactHeaders(recording.response.headers, service),
      bodyText: redactBody(recording.response.bodyText, service),
    },
  };
}

function headersToObject(headers: Headers): Record<string, string> {
  const object: Record<string, string> = {};
  headers.forEach((value, name) => {
    object[name.toLowerCase()] = value;
  });
  return object;
}

function initHeadersToObject(
  init: RequestInit | undefined,
): Record<string, string> {
  if (!init?.headers) return {};
  return headersToObject(new Headers(init.headers));
}

export interface RecordedFetchOptions {
  readonly url: string;
  readonly init?: RequestInit;
}

/**
 * Returns the recorded response for `name`, recording it first if asked to.
 *
 * In `replay` (the default) THIS NEVER TOUCHES THE NETWORK. In `record` it
 * reaches the real service exactly once, redacts, writes, and warns so a human
 * reviews the committed file before it merges.
 */
export async function recordedFetch(
  service: ServiceDeclaration,
  name: string,
  options: RecordedFetchOptions,
): Promise<Recording> {
  return fixtureMode() === "record"
    ? await record(service, name, options)
    : await replay(service, name);
}

async function replay(
  service: ServiceDeclaration,
  name: string,
): Promise<Recording> {
  const path = fixturePath(service, name);

  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    /**
     * AC-9: LOUD, and never a quiet fall through to the live network. A
     * recorder that silently fetched when a fixture was missing would make the
     * suite pass on one machine and fail on another, and would put a real
     * network call inside a test run that promised not to make one.
     */
    throw new Error(
      [
        `No recording for "${name}" at ${path}.`,
        "",
        "Replay never falls back to the network, so this stops here rather",
        "than quietly reaching the real service.",
        "",
        "Record it once, review what it captured, and commit it:",
        "",
        `  TEST_FIXTURE_MODE=record pnpm test --project unit -t "${name}"`,
      ].join("\n"),
    );
  }

  // Parsed rather than trusted: a recording is a file on disk that anyone can
  // edit, which makes it exactly the untrusted boundary the project rule means.
  return recordingSchema.parse(JSON.parse(raw));
}

async function record(
  service: ServiceDeclaration,
  name: string,
  options: RecordedFetchOptions,
): Promise<Recording> {
  const response = await fetch(options.url, options.init);
  const bodyText = await response.text();

  const captured: Recording = {
    recordedFrom: {
      method: options.init?.method ?? "GET",
      url: options.url,
      headers: initHeadersToObject(options.init),
    },
    response: {
      status: response.status,
      headers: headersToObject(response.headers),
      bodyText,
    },
  };

  const safe = redact(captured, service);
  const path = fixturePath(service, name);

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(safe, null, 2)}\n`, "utf8");

  warnRecorded(service.name, path);

  return safe;
}

/**
 * AC-8: record mode warns, and the warning actually reaches a human.
 *
 * WRITTEN TO `process.stderr` RATHER THAN THROUGH `console.warn`, AND THAT IS
 * THE WHOLE POINT OF THIS FUNCTION. Vitest intercepts `console.log`, `console.warn`
 * and `console.error` alike and prints none of them for a passing test under the
 * default reporter, so the warning this criterion asks for was being written and
 * then swallowed: a normal `TEST_FIXTURE_MODE=record` run showed only the pass
 * summary. `process.stderr.write` is not intercepted and goes straight out.
 *
 * Fixing it here rather than by turning on `disableConsoleIntercept` in
 * `vitest.config.mts` is deliberate. That switch is global: it would push every
 * `console.*` call in every test straight to the terminal, which is a lot of
 * noise to buy one message. This is the one message that must not be missed, so
 * it is the one message that opts out.
 *
 * A recording is a real response from a real service, committed into git. The
 * redaction is a floor, not a substitute for a human reading the file.
 */
function warnRecorded(serviceName: string, path: string): void {
  process.stderr.write(
    [
      "",
      `RECORDED a real response from ${serviceName} into ${path}.`,
      "This reached the live network and is about to be committed.",
      "Read the file before you commit it: check that nothing in the body is a",
      "credential or a real personal identifier. Header values are already",
      `replaced with "${REDACTED}" unless the service allows them.`,
      "",
      "",
    ].join("\n"),
  );
}
