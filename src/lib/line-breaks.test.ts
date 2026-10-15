import { describe, expect, it } from "vitest";

import { LINE_BREAK_CASES } from "../../test/fixtures/line-break-cases";

import { normalizeLineBreaks } from "./line-breaks";

/**
 * `normalizeLineBreaks()` over the shared case list (spec 0025, AC-5). The SQL
 * twin runs the same list in `test/integration/normalize-line-breaks.test.ts`.
 */
describe("normalizeLineBreaks", () => {
  for (const testCase of LINE_BREAK_CASES) {
    it(testCase.name, () => {
      expect(normalizeLineBreaks(testCase.input)).toBe(testCase.expected);
    });
  }

  it("leaves no carriage return behind in any case", () => {
    for (const testCase of LINE_BREAK_CASES) {
      expect(normalizeLineBreaks(testCase.input)).not.toContain("\r");
    }
  });
});
