import { describe, expect, it } from "vitest";

import { USAGE_GATE_REASONS } from "./gate";
import { SENTENCES } from "./copy";

/**
 * The usage gate's five sentences (spec 0011, `## Copy`).
 *
 * These are the engineer's own strings, used verbatim, and the spec says in
 * terms that `/develop` must not invent or reword any of them. So the tests
 * here are about the CONSTRAINTS the spec put on specific slots, mirroring
 * `src/features/auth/copy.test.ts`, rather than about taste.
 */

describe("every reason has a sentence", () => {
  it.each(USAGE_GATE_REASONS)("gives %s a non empty string", (reason) => {
    expect(SENTENCES[reason]).toBeTypeOf("string");
    expect(SENTENCES[reason].length).toBeGreaterThan(0);
  });
});

describe("COPY-2 and COPY-3: never implying the person's own usage caused it", () => {
  /**
   * The spec's own guidance for both slots: the remedy is a wait, and the
   * sentence must not suggest the reader's own usage is why. Leading with
   * "for everyone, not just you" is what makes that true, so it is asserted
   * directly rather than only documented.
   */
  it.each(["global_day_cap_reached", "global_month_cap_reached"] as const)(
    "leads %s with 'for everyone, not just you'",
    (reason) => {
      expect(SENTENCES[reason]).toMatch(/^\S.*for everyone, not just you/);
    },
  );
});

describe("COPY-4 and COPY-5: a deliberate pause is not the same event as a break", () => {
  /**
   * The whole reason spec 0011 splits `kill_switch_engaged` from
   * `kill_switch_unavailable` instead of one "search is down" reason: a flip a
   * human chose and a read that broke are different events, and only one of
   * them is the system working as intended. A later edit that collapses these
   * two reasons back into one should fail here first.
   */
  it("COPY-4 claims the pause is deliberate", () => {
    expect(SENTENCES.kill_switch_engaged).toMatch(/deliberate/);
  });

  it("COPY-5 does not claim to be deliberate, and promises no reset time", () => {
    const sentence = SENTENCES.kill_switch_unavailable;

    expect(sentence).not.toMatch(/deliberate/);
    // No reset time is ever named: unlike COPY-4's known "turned back on",
    // nobody knows when a broken read will be fixed.
    expect(sentence).not.toMatch(/\b(today|tomorrow|hour|minute)\b/i);
  });
});
