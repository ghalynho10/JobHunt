import { describe, expect, it } from "vitest";

import {
  parseReturnPath,
  parseReturnPathCookie,
  RETURN_PATH_COOKIE,
  RETURN_PATH_HEADER,
  RETURN_PATH_MAX_LENGTH,
} from "./return-path";

/**
 * Spec 0008, AC-12: the return path validator, and the threat model made
 * concrete.
 *
 * THE HOSTILE STRINGS ARE NAMED ONE BY ONE ON PURPOSE. The value is now user
 * visible and user supplied: anyone can send a victim `/sign-in?next=<anything>`,
 * so this validator is the only thing standing between that link and an open
 * redirect. A table of "invalid inputs" would prove the schema refuses things;
 * naming each attack proves it refuses the ones that matter, and a later reader
 * can see which attack a removed line used to cover.
 */

describe("the names the whole mechanism shares", () => {
  /**
   * AC-5b. Two spellings that differ by one byte is a silent no op: nothing
   * throws, and the deep link simply stops working. The spec fixes both strings,
   * so they are asserted here rather than left to whoever edits the file next.
   */
  it("holds the header and cookie names the spec fixed", () => {
    expect(RETURN_PATH_HEADER).toBe("x-jobhunt-pathname");
    expect(RETURN_PATH_COOKIE).toBe("jobhunt_return_path");
    expect(RETURN_PATH_MAX_LENGTH).toBe(2048);
  });
});

describe("a safe same site path is accepted", () => {
  it("keeps a path and its query string", () => {
    // The spec's own end to end example (AC-16).
    expect(parseReturnPath("/search?q=react")).toBe("/search?q=react");
  });

  it("accepts a bare path", () => {
    expect(parseReturnPath("/applications")).toBe("/applications");
  });

  it("drops the fragment and keeps everything before it", () => {
    /**
     * A browser never sends the fragment, so this is a property of the validator
     * in isolation. It matters because the value can now also be typed into
     * `?next=` by hand, where a fragment can arrive.
     */
    expect(parseReturnPath("/search?q=react#results")).toBe("/search?q=react");
  });
});

describe("the hostile strings, each named", () => {
  it("refuses a protocol relative path pointing at another host", () => {
    // The plainest open redirect there is: a browser reads this as `http://evil.com`.
    expect(parseReturnPath("//evil.com")).toBeUndefined();
  });

  it("refuses a backslash, which a URL parser reads as a slash", () => {
    // `/\evil.com` is `//evil.com` by the time the browser follows it.
    expect(parseReturnPath("/\\evil.com")).toBeUndefined();
  });

  it("refuses a scheme", () => {
    expect(parseReturnPath("https://evil.com")).toBeUndefined();
    expect(parseReturnPath("javascript:alert(1)")).toBeUndefined();
  });

  it("refuses a value that is harmless before percent decoding and hostile after", () => {
    /**
     * THE CASE THAT MOTIVATES THE ORDER OF THE CHECKS. `%09` is a tab. Whatever
     * hands this validator a value has already decoded it, and the WHATWG URL
     * parser strips tabs, so this parses to `//evil.com` unless the control
     * character is refused before anything is parsed.
     */
    const decoded = decodeURIComponent("/%09/evil.com");

    expect(decoded).not.toBe("//evil.com");
    expect(new URL(decoded, "http://x.invalid").origin).toBe("http://evil.com");
    expect(parseReturnPath(decoded)).toBeUndefined();
  });

  it("refuses a percent encoded value that decodes to a protocol relative path", () => {
    expect(decodeURIComponent("%2F%2Fevil.com")).toBe("//evil.com");
    expect(
      parseReturnPath(decodeURIComponent("%2F%2Fevil.com")),
    ).toBeUndefined();
  });

  it("refuses a path that normalises into a protocol relative path", () => {
    /**
     * THE OUTPUT GUARD, MEASURED. This has a single leading slash, contains no
     * control character and no backslash, and resolves to this site's origin, so
     * every input side check passes. It normalises to `//evil.com`. A validator
     * that only checked its input would return that string and hand the caller
     * an open redirect.
     */
    expect(new URL("/a/..//evil.com", "http://x.invalid").pathname).toBe(
      "//evil.com",
    );
    expect(parseReturnPath("/a/..//evil.com")).toBeUndefined();
  });

  it("refuses a value over the shared length cap", () => {
    const overCap = `/${"a".repeat(RETURN_PATH_MAX_LENGTH)}`;

    expect(overCap.length).toBeGreaterThan(RETURN_PATH_MAX_LENGTH);
    expect(parseReturnPath(overCap)).toBeUndefined();

    // One character under the cap still passes, so the cap is a boundary and
    // not a blanket refusal of long paths.
    const atCap = `/${"a".repeat(RETURN_PATH_MAX_LENGTH - 1)}`;

    expect(atCap.length).toBe(RETURN_PATH_MAX_LENGTH);
    expect(parseReturnPath(atCap)).toBe(atCap);
  });

  it("refuses the three routes that would loop or resolve back to the rule", () => {
    /**
     * `/sign-in` and `/auth/callback` would send the visitor back into the
     * journey they are already on. `/go` would not loop, but it resolves
     * straight to the landing rule, so honouring it would make the deep link a
     * no op that looks honoured.
     */
    expect(parseReturnPath("/sign-in")).toBeUndefined();
    expect(parseReturnPath("/sign-in?error=no_code")).toBeUndefined();
    expect(parseReturnPath("/auth/callback")).toBeUndefined();
    expect(parseReturnPath("/go")).toBeUndefined();
  });

  it("refuses an absent, empty or relative value without throwing", () => {
    expect(parseReturnPath(undefined)).toBeUndefined();
    expect(parseReturnPath(null)).toBeUndefined();
    expect(parseReturnPath("")).toBeUndefined();
    expect(parseReturnPath("search")).toBeUndefined();
  });
});

describe("the cookie the Server Action wrote", () => {
  it("decodes what the action encoded and validates the result", () => {
    // The exact round trip: encoded on write, decoded before validation on read.
    const written = encodeURIComponent("/search?q=react");

    expect(parseReturnPathCookie(written)).toBe("/search?q=react");
  });

  it("returns nothing for a value that cannot be decoded", () => {
    /**
     * A lone percent sign makes `decodeURIComponent` throw, and anybody can send
     * one. The callback must never answer a browser with a 500, so this is
     * caught rather than allowed to escape: a cookie nobody can decode is a
     * cookie with no destination in it.
     */
    expect(() => decodeURIComponent("%")).toThrow();
    expect(parseReturnPathCookie("%")).toBeUndefined();
  });

  it("still refuses a hostile value that arrives encoded", () => {
    expect(
      parseReturnPathCookie(encodeURIComponent("//evil.com")),
    ).toBeUndefined();
  });

  it("returns nothing when there is no cookie", () => {
    expect(parseReturnPathCookie(undefined)).toBeUndefined();
  });
});
