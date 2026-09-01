import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DATA_RECIPIENTS, ENV_KEYS_WITH_NO_RECIPIENT } from "./recipients";

/**
 * The recipient drift guard (spec 0009, AC-3, AC-5).
 *
 * WHAT THIS TEST IS ACTUALLY FOR. It is not checking that today's list is
 * right, which a reader can do by eye. It is making the list impossible to
 * leave behind: features 11, 13 and 14 each add a company this notice will have
 * to name, and each arrives with an `src/env.ts` key. Without this test the
 * notice would quietly stop describing where data goes, which is the one defect
 * that makes a privacy notice worse than none.
 *
 * IT READS `src/env.ts` AS TEXT rather than importing `env`. Importing it
 * yields the parsed VALUES, and a variable absent from the current environment
 * simply is not there, so a test built on the object would pass while blind to
 * exactly the key it exists to catch. The declaration is the contract; the
 * values are one machine's copy of it.
 */

const envSource = readFileSync(
  fileURLToPath(new URL("../../env.ts", import.meta.url)),
  "utf8",
);

/**
 * Every variable name declared in `src/env.ts`.
 *
 * Read from the `runtimeEnv` block alone, which is the one place the file lists
 * every key exactly once: `server` and `client` are two blocks and a key in
 * neither would be unreachable anyway, since Next.js only inlines what
 * `runtimeEnv` spells out literally. Comments are stripped first, so a key
 * named in a doc comment is never mistaken for a declaration.
 */
function declaredEnvKeys(): readonly string[] {
  const code = envSource
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  const block = /runtimeEnv:\s*\{([\s\S]*?)\n  \},/.exec(code)?.[1];
  if (block === undefined) {
    throw new Error(
      "Could not find the runtimeEnv block in src/env.ts. If its shape changed, fix this reader: the guard is worthless if it silently finds nothing.",
    );
  }

  return [...block.matchAll(/^\s*([A-Z][A-Z0-9_]*):/gm)].map(
    (match) => match[1] as string,
  );
}

const declared = declaredEnvKeys();
const claimedByRecipient = DATA_RECIPIENTS.flatMap(
  (recipient) => recipient.envKeys,
);
const claimedByNobody = ENV_KEYS_WITH_NO_RECIPIENT.map((entry) => entry.key);

describe("the reader that finds the env keys", () => {
  /**
   * The guard below is only as good as this. A regex that matched nothing would
   * turn every assertion into a comparison of two empty sets, which passes
   * cheerfully while proving the opposite of what it claims.
   */
  it("actually finds the declared keys, so the guard is not vacuous", () => {
    expect(declared.length).toBeGreaterThan(5);
    expect(declared).toContain("SUPABASE_SECRET_KEY");
    expect(declared).toContain("NEXT_PUBLIC_SENTRY_DSN");
  });

  it("does not mistake a key named in a comment for a declaration", () => {
    /** `DEV_SESSION_ENABLED` is discussed at length in the file's comments. */
    expect(
      declared.filter((key) => key === "DEV_SESSION_ENABLED"),
    ).toHaveLength(1);
  });
});

describe("every env key is accounted for (covers AC-5)", () => {
  it("leaves no key unclassified", () => {
    const accounted = new Set([...claimedByRecipient, ...claimedByNobody]);
    const unaccounted = declared.filter((key) => !accounted.has(key));

    expect(
      unaccounted,
      "A new key in src/env.ts usually means a new company receives data. Add it to that recipient's envKeys in recipients.ts and name the company on /privacy, or, if it reaches nobody, say so in ENV_KEYS_WITH_NO_RECIPIENT with a reason.",
    ).toEqual([]);
  });

  it("holds no entry for a key that no longer exists", () => {
    const stale = [...claimedByRecipient, ...claimedByNobody].filter(
      (key) => !declared.includes(key),
    );

    expect(stale).toEqual([]);
  });

  it("claims each key exactly once, so two entries cannot both own it", () => {
    const all = [...claimedByRecipient, ...claimedByNobody];

    expect(all).toHaveLength(new Set(all).size);
  });
});

describe("the list the page renders (covers AC-3, AC-6)", () => {
  it("names the five companies data reaches today", () => {
    expect(DATA_RECIPIENTS.map((recipient) => recipient.id)).toEqual([
      "supabase",
      "vercel",
      "sentry",
      "google",
      "github",
    ]);
  });

  it("gives every recipient words for what it gets and why", () => {
    for (const recipient of DATA_RECIPIENTS) {
      expect(recipient.name.length).toBeGreaterThan(0);
      expect(recipient.receives.length).toBeGreaterThan(0);
      expect(recipient.why.length).toBeGreaterThan(0);
    }
  });

  it("keeps the ids unique, since the page keys its list by them", () => {
    const ids = DATA_RECIPIENTS.map((recipient) => recipient.id);

    expect(ids).toHaveLength(new Set(ids).size);
  });

  /**
   * The two OAuth providers are the entries the AC-5 guard cannot see, because
   * their credentials live in `supabase/config.toml` and the Supabase
   * dashboard. An empty `envKeys` is the honest record of that, so it is
   * asserted rather than left to look like an oversight.
   */
  it("records Google and GitHub as holding no key of their own", () => {
    const providers = DATA_RECIPIENTS.filter((recipient) =>
      ["google", "github"].includes(recipient.id),
    );

    expect(providers).toHaveLength(2);
    for (const provider of providers) expect(provider.envKeys).toEqual([]);
  });
});

/**
 * The classification guard (spec 0009, AC-3, AC-5, invariant 2).
 *
 * WHY THIS EXISTS. The tests above prove every key is accounted for exactly
 * once. None of them proves the account is TRUE. A key filed under
 * `ENV_KEYS_WITH_NO_RECIPIENT` carries a `why` string in prose, and prose is not
 * checked by anything, so a wrong classification hides behind a reason that
 * reads plausibly. That is not a hypothetical: `NEXT_PUBLIC_VERCEL_ENV` shipped
 * in that list saying it "carries nothing outward" while both Sentry configs
 * were passing it as `environment`, and it took a cross check on a different
 * model to notice. This is that cross check, made permanent.
 *
 * WHAT IT CAN AND CANNOT DO. It cannot read prose. What it can do is catch the
 * shape the mistake takes: a key said to reach nobody, read inside a module
 * whose whole job is configuring a company's SDK. That is a narrow signal, and
 * narrow is the point. A broader rule, "read in any file that also reads a
 * recipient's key", was tried first and false positives immediately, because
 * `origin.ts` reads `NEXT_PUBLIC_VERCEL_ENV` to pick an origin and has nothing
 * to do with Sentry. A guard that cries wolf gets deleted.
 */
const RECIPIENT_CONFIG_MODULES = [
  "../../sentry.server.config.ts",
  "../../instrumentation-client.ts",
  "../../lib/supabase/server.ts",
  "../../lib/supabase/secret.ts",
] as const;

describe("a key said to reach nobody is not read where a recipient is configured", () => {
  const modules = RECIPIENT_CONFIG_MODULES.map((relativePath) => ({
    relativePath,
    source: readFileSync(
      fileURLToPath(new URL(relativePath, import.meta.url)),
      "utf8",
    )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, ""),
  }));

  /**
   * The module list is hand written, so it can rot silently in the one way that
   * matters: a file moves, this stops reading anything, and the guard passes on
   * nothing at all. `readFileSync` already throws on a missing path, and this
   * asserts the contents are real.
   */
  it("reads real configuration modules, so the guard is not vacuous", () => {
    expect(modules).toHaveLength(RECIPIENT_CONFIG_MODULES.length);
    for (const { relativePath, source } of modules) {
      expect(source.length, `${relativePath} is empty`).toBeGreaterThan(50);
    }
    expect(
      modules.some(({ source }) => source.includes("Sentry.init")),
      "No module here still calls Sentry.init. If the Sentry setup moved, point this list at its new home rather than deleting the guard.",
    ).toBe(true);
  });

  it.each(ENV_KEYS_WITH_NO_RECIPIENT)(
    "$key is not read in any recipient's configuration",
    ({ key }) => {
      const offenders = modules
        .filter(({ source }) => new RegExp(`env\\.${key}\\b`).test(source))
        .map(({ relativePath }) => relativePath);

      expect(
        offenders,
        `${key} is filed as reaching no third party, but ${offenders.join(", ")} configures a company's SDK and reads it. Either its value is sent onward, in which case move it into that recipient's envKeys, or the read is incidental and the entry needs a reason that says so.`,
      ).toEqual([]);
    },
  );
});
