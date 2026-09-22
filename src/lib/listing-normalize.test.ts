import * as Sentry from "@sentry/nextjs";
import { describe, expect, it } from "vitest";

import {
  DECODE_CASES,
  DECODES_TO_BLANK,
} from "../../test/fixtures/decode-cases";
import { capturedEvents } from "../../test/setup/sentry-transport";

import { decodeListingText } from "./listing-normalize";

/**
 * The listing text decoder (spec 0022, AC-4, AC-5).
 *
 * The Sentry assertions read the real SDK through the in memory transport the
 * setup file installs, not a spy, so a report that never reaches the SDK's
 * send path fails here.
 */

const CONTEXT = { sourceJobId: "5883839578", field: "description" } as const;

/** Message events are handed to the transport asynchronously. */
async function eventsAfterFlush() {
  await Sentry.flush(2000);
  return capturedEvents();
}

describe("decodeListingText decodes AC-4's ten tokens once", () => {
  for (const testCase of DECODE_CASES) {
    it(testCase.name, () => {
      expect(decodeListingText(testCase.input, CONTEXT)).toBe(
        testCase.expected,
      );
    });
  }

  it("never decodes backslash, backslash, n into a line break", () => {
    // Spelled out beside the shared case, because it is the one a chained
    // replace would get wrong: three input characters, two output characters.
    const decoded = decodeListingText("\\\\n", CONTEXT);

    expect(decoded).toBe("\\n");
    expect(decoded).toHaveLength(2);
    expect(decoded).not.toContain("\n");
  });

  it("never decodes &amp;lt; into <", () => {
    const decoded = decodeListingText("&amp;lt;", CONTEXT);

    expect(decoded).toBe("&lt;");
    expect(decoded).not.toContain("<");
  });

  it("does not trim, so the caller's trim is the only one", () => {
    for (const input of DECODES_TO_BLANK) {
      expect(decodeListingText(input, CONTEXT).trim()).toBe("");
    }
    expect(decodeListingText("\\nx\\n", CONTEXT)).toBe("\nx\n");
  });
});

describe("a fragment left over after decoding is reported, never dropped (AC-5)", () => {
  it("reports a stray backslash sequence at warning level, with the id and field", async () => {
    const decoded = decodeListingText("see \\x here", CONTEXT);

    // Still rendered and stored with the fragment intact.
    expect(decoded).toBe("see \\x here");

    const events = await eventsAfterFlush();
    expect(events).toHaveLength(1);
    expect(events[0]?.level).toBe("warning");
    expect(events[0]?.extra).toMatchObject({
      sourceJobId: "5883839578",
      field: "description",
      fragments: ["\\x"],
    });
  });

  it("reports an entity outside the five named ones", async () => {
    const decoded = decodeListingText("caf&eacute;", {
      sourceJobId: "42",
      field: "title",
    });

    expect(decoded).toBe("caf&eacute;");

    const events = await eventsAfterFlush();
    expect(events).toHaveLength(1);
    expect(events[0]?.extra).toMatchObject({
      sourceJobId: "42",
      field: "title",
      fragments: ["&eacute;"],
    });
  });

  it("groups every report under one fixed message and fingerprint", async () => {
    decodeListingText("\\x", { sourceJobId: "1", field: "title" });
    decodeListingText("&nbsp;", { sourceJobId: "2", field: "location" });

    const events = await eventsAfterFlush();
    expect(events).toHaveLength(2);
    expect(events[0]?.message).toBe(events[1]?.message);
    expect(events[0]?.fingerprint).toEqual(events[1]?.fingerprint);
    expect(events[0]?.message).not.toContain("1");
  });

  it("does not report an ordinary ampersand, a bare trailing backslash, or a known token", async () => {
    decodeListingText("R&D, Q&A & more", CONTEXT);
    decodeListingText("ends with \\", CONTEXT);
    decodeListingText("line\\nbreak &amp; &#39;", CONTEXT);
    // Decodes to backslash n and &lt;, both inside the known set.
    decodeListingText("\\\\n &amp;lt;", CONTEXT);

    expect(await eventsAfterFlush()).toHaveLength(0);
  });
});
