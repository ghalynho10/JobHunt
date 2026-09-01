import { z } from "zod";

/**
 * The return path: the one place its names, its length cap and its validator
 * live (spec 0008, AC-5b, AC-12).
 *
 * A deep link a visitor followed while signed out travels through three
 * boundaries before it is used: the request header `src/proxy.ts` echoes, the
 * `next` query parameter the `(app)` layout puts on `/sign-in`, and the cookie
 * the provider Server Action writes for the callback to read. Five modules
 * across two features plus a bare route handler touch those names, which is why
 * AGENTS.md puts them in `src/lib` rather than in any one of them.
 *
 * THE STRINGS ARE FIXED BY THE SPEC RATHER THAN CHOSEN HERE. Two spellings that
 * differ by one byte is a silent no op: the writer writes, the reader looks for
 * something else, nothing throws, and the deep link simply stops working with
 * nothing reporting it.
 *
 * This module holds no session and reads nothing. It is imported by `proxy.ts`,
 * which runs before any React render, so it must stay free of `server-only` and
 * of anything that needs a request scope.
 */

/**
 * The request header the proxy sets on every request it sees.
 *
 * Upstream only: it is set through `NextResponse.next({ request: { headers } })`
 * so it never reaches the browser, and it is always `set`, never appended, so a
 * value a client sent is overwritten before anything reads it.
 */
export const RETURN_PATH_HEADER = "x-jobhunt-pathname";

/**
 * The cookie the provider Server Action writes and the callback clears.
 *
 * Scoped to `/auth/callback` so it is not carried on ordinary navigation, and
 * short lived: it exists only for the round trip to the provider and back.
 */
export const RETURN_PATH_COOKIE = "jobhunt_return_path";

/**
 * The cookie's `Path`, named once because a clear that does not repeat the
 * exact `Path` it was written with silently fails to match, and the value then
 * survives to fire at a later sign in (AC-15).
 */
export const RETURN_PATH_COOKIE_PATH = "/auth/callback";

/**
 * The hidden field each provider form carries the value in (AC-13, AC-14).
 *
 * It lives here rather than in `src/features/auth/actions.ts` for a mechanical
 * reason as well as a tidy one: every export of a `"use server"` module has to
 * be an async function, so a plain string constant cannot live there.
 */
export const RETURN_PATH_FIELD = "next";

/**
 * Ten minutes, in seconds. Long enough for a provider consent screen and a
 * password manager, short enough that a stale value cannot sit around.
 */
export const RETURN_PATH_COOKIE_MAX_AGE = 600;

/**
 * ONE NUMBER FOR TWO CRITERIA. The proxy omits the header above this length
 * (AC-8) and the validator refuses a value above it (AC-12). If the two ever
 * differed, the proxy would send something the validator throws away, which is
 * the deep link failing for a reason nobody could see.
 */
export const RETURN_PATH_MAX_LENGTH = 2048;

/**
 * Routes that are never a return target (AC-12).
 *
 * `/sign-in` and `/auth/callback` would loop: they are the two steps of the
 * journey the visitor is already on. `/go` would not loop, but it resolves
 * straight back to the landing rule, so honouring it would make the deep link a
 * no op that looks honoured, which is worse than refusing it.
 */
const REFUSED_TARGETS: readonly string[] = [
  "/sign-in",
  "/auth/callback",
  "/go",
];

/** A base that cannot collide with a real origin, used only to normalise. */
const NORMALISING_BASE = "http://return-path.invalid";

/**
 * The one validator, parsed at all three boundaries the value crosses (AC-12).
 *
 * IT RUNS ON THE DECODED VALUE, and the order of its checks is the whole point.
 * `URLSearchParams` and `decodeURIComponent` hand this a string that has already
 * been percent decoded, so `%09` has become a real tab by the time it arrives.
 * The WHATWG URL parser strips tabs and newlines, so a tab followed by
 * `/evil.com` parses to `//evil.com`: harmless before decoding, an open redirect
 * after it. Control characters are therefore refused BEFORE anything is parsed,
 * not after.
 *
 * The output is re-checked as well as the input, because normalising is not safe
 * by itself: `/a/..//evil.com` has a single leading slash, passes an origin
 * check, and normalises to `//evil.com`, which a browser reads as a protocol
 * relative URL pointing at another host. Both ends are measured, in this
 * module's test, against that exact string.
 */
export const returnPathSchema = z
  .string()
  .max(RETURN_PATH_MAX_LENGTH)
  /** Refused before parsing: the parser would strip these and change meaning. */
  .refine((value) => !hasControlCharacter(value), {
    message: "A return path may not contain control characters.",
  })
  /**
   * A backslash is a forward slash to a browser's URL parser, so a slash
   * followed by a backslash and a host is `//host` by the time it is followed.
   * Refused anywhere in the value.
   */
  .refine((value) => !value.includes("\\"), {
    message: "A return path may not contain a backslash.",
  })
  /** A single leading slash: a same site path, never `//host` and never a scheme. */
  .refine((value) => value.startsWith("/") && !value.startsWith("//"), {
    message: "A return path must be a single leading slash path.",
  })
  .refine((value) => resolve(value) !== undefined, {
    message: "A return path must resolve to a safe path on this site.",
  })
  /**
   * The fragment is dropped and the query kept. A browser never sends the
   * fragment, but this value can now also be typed into `?next=`, so the
   * validator drops it in isolation rather than relying on that.
   */
  .transform((value) => resolve(value) ?? "/");

/**
 * Whether the value carries a character the URL parser would strip or reject.
 *
 * Written as a code point range rather than a regular expression literal, so the
 * characters it refuses are readable in the source instead of being invisible
 * bytes inside a character class.
 */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;

    /** C0 controls, which includes tab, newline and carriage return, plus DEL. */
    if (code < 0x20 || code === 0x7f) return true;
  }

  return false;
}

/**
 * Normalise a candidate, or `undefined` when it is not a safe same site path.
 *
 * Separated from the schema because both the guard and the transform need the
 * same answer, and computing it twice is cheaper than carrying a failure through
 * a transform.
 */
function resolve(value: string): string | undefined {
  let url: URL;

  try {
    url = new URL(value, NORMALISING_BASE);
  } catch {
    return undefined;
  }

  /** A value that changed origin was never a path on this site. */
  if (url.origin !== NORMALISING_BASE) return undefined;

  if (REFUSED_TARGETS.includes(url.pathname)) return undefined;

  const resolved = `${url.pathname}${url.search}`;

  /** The output guard: normalising can produce `//host` from a safe looking input. */
  if (!resolved.startsWith("/") || resolved.startsWith("//")) return undefined;

  return resolved;
}

/**
 * The accepted return path, or `undefined`.
 *
 * A REJECTED VALUE IS DROPPED SILENTLY AND THAT IS THE SPEC'S DECISION, not an
 * oversight of the no silent failures rule. Spec 0008's API surface says an
 * invalid `next` is dropped by design: the visitor falls back to the landing
 * rule, which is a real destination rather than a default that reads like
 * success, and the alternative is a Sentry issue for every mistyped or stale
 * link. Nothing is hidden, because nothing failed: a value that never validated
 * was never a destination.
 *
 * @param value The raw value from a header, a query parameter, a form field or a
 * cookie, already percent decoded by whatever handed it over.
 * @returns The normalised path with its query and no fragment, or `undefined`.
 */
export function parseReturnPath(
  value: string | undefined | null,
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;

  const parsed = returnPathSchema.safeParse(value);

  return parsed.success ? parsed.data : undefined;
}

/**
 * The accepted return path from the cookie the Server Action wrote.
 *
 * THE DECODE IS PAIRED WITH THE ENCODE ON WRITE, and both live in this module so
 * they cannot drift apart. `decodeURIComponent` throws on a malformed sequence,
 * which is trivially easy for anyone to send, so it is caught here: the callback
 * must never answer a browser with a 500, and a cookie nobody can decode is
 * simply a cookie with no destination in it.
 *
 * @param raw The cookie's value exactly as it arrived.
 * @returns The normalised path, or `undefined`.
 */
export function parseReturnPathCookie(
  raw: string | undefined,
): string | undefined {
  if (raw === undefined) return undefined;

  let decoded: string;

  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return undefined;
  }

  return parseReturnPath(decoded);
}
