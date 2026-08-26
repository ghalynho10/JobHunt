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

  return parsed.toString();
}

/**
 * Blanks the declared credential carrying body fields.
 *
 * A body that is not JSON is left alone rather than mangled: the declaration
 * names JSON fields, so a non JSON body has nothing here to match. It is still
 * the author's job not to record a form post carrying a password, which is why
 * record mode warns and a human reviews the file.
 */
function redactBody(bodyText: string, service: ServiceDeclaration): string {
  if (service.secretBodyFields.length === 0) return bodyText;

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return bodyText;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return bodyText;
  }

  const body = parsed as Record<string, unknown>;
  for (const field of service.secretBodyFields) {
    if (field in body) body[field] = REDACTED;
  }

  return JSON.stringify(body);
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

  /**
   * AC-8: record mode warns. A recording is a real response from a real
   * service committed into git, so a human has to look at it before it merges.
   * The redaction above is a floor, not a substitute for that look.
   */
  console.warn(
    [
      "",
      `RECORDED a real response from ${service.name} into ${path}.`,
      "This reached the live network and is about to be committed.",
      "Read the file before you commit it: check that nothing in the body is a",
      "credential or a real personal identifier. Header values are already",
      `replaced with "${REDACTED}" unless the service allows them.`,
      "",
    ].join("\n"),
  );

  return safe;
}
