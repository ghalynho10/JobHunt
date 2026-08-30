import { describe, expect, it } from "vitest";

import { signInErrorSentence } from "./copy";
import { AUTH_ERROR_CODES } from "./failure-codes";

/**
 * The sign in page's sentences (spec 0007, AC-5 and AC-7).
 *
 * These are the engineer's own strings, used verbatim, and the spec says in
 * terms that `/develop` must not invent or reword any of them. So the tests here
 * are about the BOUNDARY and the PUNCTUATION RULE rather than about taste: that
 * an untrusted query value can only ever produce one of a fixed set of
 * sentences, and that no slot ever grows the punctuation the spec forbids.
 */

describe("the parse at the boundary", () => {
  it("says nothing at all when there is no error (covers AC-5)", () => {
    expect(signInErrorSentence(undefined)).toBeUndefined();
  });

  it("gives every code in the enum a sentence (covers AC-5)", () => {
    for (const code of AUTH_ERROR_CODES) {
      expect(signInErrorSentence(code)).toBeTypeOf("string");
    }
  });

  /**
   * THE LOAD BEARING ONE (AC-7). The value arrives on a query string, so it is
   * attacker supplied. Anything outside the enum has to fall to the one generic
   * sentence, and the value itself must never appear in what is rendered.
   */
  it.each([
    "<script>alert(1)</script>",
    "ACCESS_DENIED",
    "access_denied ",
    "no_code; drop table profile",
  ])("never echoes %j back to the page (covers AC-7)", (junk) => {
    const sentence = signInErrorSentence(junk);

    expect(sentence).toBe(
      "Something went wrong signing you in. Please start again below.",
    );
    expect(sentence).not.toContain(junk);
  });

  /**
   * `?error=` with nothing after it, which is its own case rather than part of
   * the list above: an empty string is contained in every string, so the "never
   * echoes" assertion is vacuous for it and would pass no matter what the page
   * rendered. What matters here is only that an empty value is treated as
   * unrecognised rather than as a code.
   */
  it("treats an empty value as unrecognised (covers AC-7)", () => {
    expect(signInErrorSentence("")).toBe(
      "Something went wrong signing you in. Please start again below.",
    );
  });

  /**
   * A repeated query parameter (`?error=a&error=b`) arrives as an array, which
   * is a malformed request rather than a code. It takes the generic sentence
   * instead of quietly reading the first member, because reading the first
   * member is how a smuggled second value gets ignored rather than noticed.
   */
  it("treats a repeated parameter as malformed (covers AC-7)", () => {
    expect(signInErrorSentence(["access_denied", "no_code"])).toBe(
      "Something went wrong signing you in. Please start again below.",
    );
  });
});

describe("the punctuation rule the spec puts on this block", () => {
  /**
   * Not a style preference, and the spec says why: this is the only text a user
   * actually reads, and em dash overuse is one of the most cited markers of
   * machine written text, which costs something real on a portfolio facing
   * product. The rule has no carve out, `COPY-2` included when it is written.
   */
  it.each(AUTH_ERROR_CODES)(
    "keeps %s free of em dashes, en dashes and semicolons",
    (code) => {
      const sentence = signInErrorSentence(code) ?? "";

      expect(sentence).not.toMatch(/[–—;]/u);
    },
  );
});

describe("the two sentences that carry a constraint of their own", () => {
  /**
   * `COPY-4`'s closing clause is AC-4's fix in plain words, not politeness.
   * Restarting from the sign in page is precisely what resolves the host only
   * PKCE cookie case, on a per commit preview URL or on the old production host.
   * The spec calls the clause load bearing and says it must not be trimmed for
   * brevity, so trimming it fails here.
   */
  it("keeps COPY-4's restart instruction intact (covers AC-4)", () => {
    expect(signInErrorSentence("exchange_failed")).toBe(
      "We couldn't finish signing you in. Start again from here. An older tab or link won't work.",
    );
  });

  /**
   * `COPY-5` stays generic rather than naming the failing provider. That was
   * settled in the spec so it is not reopened at build time: the redirect
   * carries only the code, and AC-7 parses a closed enum with no provider
   * dimension in it.
   */
  it("keeps COPY-5 from naming a provider (covers AC-7)", () => {
    const sentence = signInErrorSentence("provider_unavailable") ?? "";

    expect(sentence).not.toMatch(/google|github/iu);
  });
});
