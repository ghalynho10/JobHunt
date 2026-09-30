import { describe, expect, it } from "vitest";

import { RESUME_MAX_LENGTH } from "./limits";
import { saveResumeSchema } from "./schemas";

/**
 * The save boundary's line breaks (spec 0024, AC-3, AC-7).
 *
 * A BROWSER POSTS EVERY LINE BREAK AS `\r\n`, and a textarea reports the same
 * text back with `\n` only. Stored as posted, a saved version could never equal
 * the field it reopens in, so the editor called itself unsaved before anyone
 * typed, and the length check counted one hidden character per line. Found by
 * `/check verify` on 2026-09-30: version 1 was stored at 300 characters, 19 of
 * them `\r`, and reopened at 281.
 */

/** A submission the way a browser actually sends it. */
function posted(content: string) {
  return { content, previousVersionNumber: "0" };
}

describe("line breaks at the save boundary (AC-3, AC-7)", () => {
  it("stores what a textarea will report when the text is read back", () => {
    // covers: AC-7
    const parsed = saveResumeSchema.parse(
      posted("Jane Doe\r\n\r\n## Skills\r\n- Go\rend"),
    );

    expect(parsed.content).toBe("Jane Doe\n\n## Skills\n- Go\nend");
  });

  it("measures the ceiling in the characters the reader can see", () => {
    // covers: AC-3
    const lines = Array.from({ length: 20 }, () => "a".repeat(998));
    const visible = `${lines.join("\n")}\n${"b".repeat(RESUME_MAX_LENGTH - 20 * 998 - 20 - 5)}`;
    const asPosted = visible.replaceAll("\n", "\r\n");

    expect(visible.length).toBe(RESUME_MAX_LENGTH - 5);
    expect(asPosted.length).toBeGreaterThan(RESUME_MAX_LENGTH);
    expect(saveResumeSchema.safeParse(posted(asPosted)).success).toBe(true);
  });

  it("still refuses text that is only line breaks", () => {
    // covers: AC-3
    expect(saveResumeSchema.safeParse(posted("\r\n\r\n  \r\n")).success).toBe(
      false,
    );
  });
});
