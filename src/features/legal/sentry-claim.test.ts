import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The Sentry claim regression guard (spec 0009, AC-4).
 *
 * THE PRIVACY NOTICE MAKES A CLAIM ABOUT CODE THAT LIVES SOMEWHERE ELSE. It
 * says Sentry receives no personal data, and that is true only while both
 * Sentry configurations keep `userInfo` off, `httpBodies` empty and `cookies`
 * off. Any one of those flipped would send names, resumes or session cookies to
 * a third party while a permanent public page went on saying otherwise. Nothing
 * about editing `sentry.server.config.ts` would remind anyone that a legal
 * notice depends on it, so this test is that reminder.
 *
 * READ AS TEXT, NOT IMPORTED. Importing either file calls `Sentry.init()` for
 * real, and neither exports what it passed. The configuration is the assertion
 * here, so the declaration is what has to be read.
 */

const CONFIGS = [
  "../../sentry.server.config.ts",
  "../../instrumentation-client.ts",
] as const;

/** The `dataCollection` block of one config, comments stripped. */
function dataCollectionBlock(relativePath: string): string {
  const source = readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    "utf8",
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  const block = /dataCollection:\s*\{([\s\S]*?)\n  \},/.exec(source)?.[1];
  if (block === undefined) {
    throw new Error(
      `${relativePath} has no dataCollection block. The privacy notice's claim that Sentry receives no personal data rests on it, so its absence is a failure, not a pass.`,
    );
  }

  return block;
}

describe.each(CONFIGS)(
  "%s keeps personal data out of Sentry (covers AC-4)",
  (config) => {
    const block = dataCollectionBlock(config);

    it("sends no user identity", () => {
      expect(block).toMatch(/userInfo:\s*false/);
      expect(block).not.toMatch(/userInfo:\s*true/);
    });

    it("collects no request bodies, where profiles and resumes travel", () => {
      expect(block).toMatch(/httpBodies:\s*\[\s*\]/);
    });

    it("sends no cookies, so the session token never leaves", () => {
      expect(block).toMatch(/cookies:\s*false/);
      expect(block).not.toMatch(/cookies:\s*true/);
    });

    /**
     * `sendDefaultPii: true` switches all three back on at once, from a
     * different line, without touching anything asserted above. It is the way
     * this claim is most likely to become false by accident.
     */
    it("does not switch them all back on with sendDefaultPii", () => {
      const source = readFileSync(
        fileURLToPath(new URL(config, import.meta.url)),
        "utf8",
      )
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      expect(source).not.toMatch(/sendDefaultPii:\s*true/);
    });
  },
);
