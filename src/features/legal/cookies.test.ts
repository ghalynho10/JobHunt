import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { COOKIE_DISCLOSURES } from "./cookies";

/**
 * The cookie drift guard's secondary net (spec 0009, AC-24).
 *
 * THIS IS THE CHEAP, INCOMPLETE HALF. The primary guard, in
 * `test/integration/`, asserts the real `Set-Cookie` names a real sign in, a
 * real callback, and an ordinary signed in navigation actually produce. This
 * test only proves the registry accounts for every call site the source text
 * appears to reach, which is not the same claim: a wrapper function or a
 * direct `Set-Cookie` header write would pass this test silently, the same
 * accepted limitation `no-tracking.test.ts`'s script tag scan and
 * `recipients.test.ts`'s `RECIPIENT_CONFIG_MODULES` list already carry.
 */

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

const root = (path: string): string =>
  fileURLToPath(new URL(`../../../${path}`, import.meta.url));

/** Every `.ts` and `.tsx` file under `src/`, tests excluded. */
function sourceFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry.name)) return [];
    if (/\.test\.tsx?$/.test(entry.name)) return [];
    return [path];
  });
}

/**
 * A call that can put a `Set-Cookie` header on a real response.
 *
 * DELIBERATELY NARROWER THAN "EVERY `.set(` ON SOMETHING CALLED COOKIES".
 * `request.cookies.set(` writes through to the request's own `cookie` header
 * and never reaches a response, `src/proxy.ts`'s own comment on the loop that
 * does this says so directly, so this pattern excludes it on purpose rather
 * than missing it. A plain `cookies.set(` on a local variable, an in memory
 * jar rather than a real cookie store, does not match either, because it
 * carries no `response.` or `cookieStore.` prefix. That is what keeps this
 * scan from proposing something that is not a cookie at all, which is exactly
 * what the first draft of this criterion did before a cross check caught it
 * (see the spec's Feature design).
 */
const COOKIE_SET_PATTERN = /\bresponse\.cookies\.set\(|\bcookieStore\.set\(/;

/** Every real call site this scan finds, as `src/relative/path.ts:line`. */
function findCookieSetCallSites(): readonly string[] {
  const files = sourceFiles(root("src"));
  const sites: string[] = [];

  for (const path of files) {
    /**
     * Line numbers must survive stripping, or every match after the first
     * multi-line comment reports the wrong line. A block comment's newlines
     * are kept, one per original line, rather than collapsed away with its
     * content.
     */
    const code = readFileSync(path, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, (block) =>
        "\n".repeat(block.split("\n").length - 1),
      )
      .replace(/\/\/.*$/gm, "");
    const relative = path.slice(repoRoot.length);

    code.split("\n").forEach((line, index) => {
      if (COOKIE_SET_PATTERN.test(line)) sites.push(`${relative}:${index + 1}`);
    });
  }

  return sites;
}

describe("the reader that finds cookie setting call sites", () => {
  const found = findCookieSetCallSites();

  it("actually finds real call sites, so the guard is not vacuous", () => {
    expect(found.length).toBeGreaterThan(0);
    expect(found).toContain("src/proxy.ts:144");
    expect(found).toContain("src/lib/supabase/server.ts:59");
  });

  it("does not match request.cookies.set, which never reaches a response", () => {
    expect(found.some((site) => site.startsWith("src/proxy.ts:81"))).toBe(
      false,
    );
  });

  it("does not match the demo refresh's in memory jar, which is not a cookie store", () => {
    expect(found.some((site) => site.includes("refresh-session.ts"))).toBe(
      false,
    );
  });

  it("does not match the read only adapter's deliberate no-op", () => {
    expect(found.some((site) => site.includes("read-only-cookies.ts"))).toBe(
      false,
    );
  });
});

describe("every cookie setting call site is accounted for (covers AC-24)", () => {
  const found = findCookieSetCallSites();
  const declared = COOKIE_DISCLOSURES.flatMap((cookie) => cookie.setBy);

  it("leaves no call site unaccounted for", () => {
    const unaccounted = found.filter((site) => !declared.includes(site));

    expect(
      unaccounted,
      `A cookie setting call site was found that no registry entry names: ${unaccounted.join(", ")}. If it is a real cookie, add it to cookies.ts and describe it on /privacy. If it cannot reach a real response, COOKIE_SET_PATTERN above needs to exclude it explicitly, the way request.cookies.set already is.`,
    ).toEqual([]);
  });

  it("holds no entry for a call site that no longer exists", () => {
    const stale = declared.filter((site) => !found.includes(site));

    expect(stale).toEqual([]);
  });

  /**
   * NOT "EXACTLY ONCE", UNLIKE THE RECIPIENT REGISTRY'S ENV KEYS. One call
   * site can legitimately produce more than one cookie: `server.ts:59` writes
   * the session cookie on an ordinary request and the PKCE verifier cookie
   * during `signInWithOAuth()`, depending on what the request actually does,
   * so both entries name it and that is correct, not a duplicate to catch.
   */
  it("claims every declared call site somewhere in the source, at least once", () => {
    for (const site of new Set(declared)) expect(found).toContain(site);
  });
});

describe("the registry itself (covers AC-14)", () => {
  it("gives every cookie words for its name, purpose, lifetime and call sites", () => {
    for (const cookie of COOKIE_DISCLOSURES) {
      expect(cookie.namePattern.length).toBeGreaterThan(0);
      expect(cookie.purpose.length).toBeGreaterThan(0);
      expect(cookie.lifetime.length).toBeGreaterThan(0);
      expect(cookie.setBy.length).toBeGreaterThan(0);
    }
  });

  it("keeps the ids unique, since the page keys its list by them", () => {
    const ids = COOKIE_DISCLOSURES.map((cookie) => cookie.id);

    expect(ids).toHaveLength(new Set(ids).size);
  });

  it("compiles every nameRegex, so a typo in it fails here rather than in the integration guard", () => {
    for (const cookie of COOKIE_DISCLOSURES) {
      expect(() => new RegExp(cookie.nameRegex)).not.toThrow();
    }
  });

  /**
   * MUTUAL EXCLUSION, VERIFIED AGAINST THE REAL NAMES THE LOCAL STACK
   * PRODUCED on 2026-09-18, not invented cases. Two patterns matching the
   * same real name would make the primary guard's per step assertions
   * ambiguous about which entry a cookie belongs to.
   */
  it("matches each real observed cookie name to exactly one entry", () => {
    const realNames = [
      "sb-127-auth-token",
      "sb-127-auth-token.0",
      "sb-127-auth-token-code-verifier",
      "sb-127-auth-token-flow-4ebf92345c2baef97d34ea40fba0cf80-code-verifier",
      "sb-127-auth-token-flows-code-verifier",
      "jobhunt_return_path",
    ];

    for (const name of realNames) {
      const matches = COOKIE_DISCLOSURES.filter((cookie) =>
        new RegExp(cookie.nameRegex).test(name),
      );

      expect(
        matches.map((cookie) => cookie.id),
        `"${name}" should match exactly one registry entry`,
      ).toHaveLength(1);
    }
  });

  it("names the three cookies this codebase sets today", () => {
    expect(COOKIE_DISCLOSURES.map((cookie) => cookie.id)).toEqual([
      "session",
      "pkce-verifier",
      "return-path",
    ]);
  });
});
