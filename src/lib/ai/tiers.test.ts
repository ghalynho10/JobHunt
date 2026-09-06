import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TIERS } from "./tiers";

/**
 * Spec 0012, AC-1: the two tiers resolve to two different vendor packages,
 * checked by reading the map itself, never by inspecting a call site.
 *
 * A language model object from either `@ai-sdk/openai` or `@ai-sdk/google`
 * carries its own `provider` string (`"openai.responses"`,
 * `"google.generative-ai"`), so the vendor is read off the model instance
 * `tiers.ts` actually built, not restated by hand here.
 */
/**
 * `TIERS[tier].model` types as the AI SDK's own `LanguageModel` union, which
 * also permits a plain gateway model id string. `tiers.ts` never constructs
 * that form (both entries call a provider factory directly), so this guard
 * narrows what the test actually built rather than casting past the type.
 */
function resolvedModel(model: (typeof TIERS)[keyof typeof TIERS]["model"]) {
  if (typeof model === "string") {
    throw new Error(
      "Expected tiers.ts to construct a real provider model instance, got a plain model id string instead.",
    );
  }
  return model;
}

describe("TIERS (covers AC-1)", () => {
  it("maps ai_scoring and ai_check to two different vendors", () => {
    const scoringVendor = resolvedModel(TIERS.ai_scoring.model).provider.split(
      ".",
    )[0];
    const checkVendor = resolvedModel(TIERS.ai_check.model).provider.split(
      ".",
    )[0];

    expect(scoringVendor).not.toBe(checkVendor);
  });

  it("names the model id each tier resolves to", () => {
    expect(resolvedModel(TIERS.ai_scoring.model).modelId).toBe("gpt-5.6-luna");
    expect(resolvedModel(TIERS.ai_check.model).modelId).toBe(
      "gemini-3.5-flash-lite",
    );
  });

  /**
   * Spec 0012, key invariant: `ai_scoring` leaves `temperature` unset rather
   * than fixed at `0`, because the OpenAI API rejects an explicit
   * `temperature: 0` whenever `reasoning.effort` is anything other than
   * `"none"`, and this tier's `reasoningEffort` is `"medium"`.
   */
  it("leaves ai_scoring's temperature unset, since it reasons at medium effort", () => {
    expect(TIERS.ai_scoring.temperature).toBeUndefined();
    expect(TIERS.ai_scoring.providerOptions).toEqual({
      openai: { reasoningEffort: "medium" },
    });
  });

  it("fixes ai_check's temperature at 0, since it does not reason", () => {
    expect(TIERS.ai_check.temperature).toBe(0);
  });

  /**
   * Spec 0012, Consequences: `usage_cap`'s dollar ceilings assume one vendor
   * call per gated call. Raising this above 0 moves the real worst case to
   * roughly 3x the seeded budget without `usage_cap` changing at all.
   */
  it("fixes maxRetries at 0 for both tiers", () => {
    expect(TIERS.ai_scoring.maxRetries).toBe(0);
    expect(TIERS.ai_check.maxRetries).toBe(0);
  });
});

/**
 * Spec 0012, AC-3: a caller never supplies a vendor name, a model id, or a
 * generation parameter. Proven here by the same source-tree walk
 * `no-tracking.test.ts` uses: no file under `src/` other than this feature's
 * own `tiers.ts` (the vendor and model map) and `client.ts` (the router
 * itself, the one file allowed to call `generateObject`) may import an
 * `@ai-sdk/` package OR the plain `ai` package.
 *
 * `ai` ITSELF IS PART OF THE OFFENDER SET, corrected 2026-09-06 by
 * `/check review`: the original guard matched only `@ai-sdk/`, which let a
 * file write `import { generateObject } from "ai"` and call it directly on
 * `TIERS.ai_scoring.model` (already a live, exported model instance),
 * skipping `callTier()`, `withUsageGate()`, and every fixed generation
 * parameter this file exists to protect. Banning `@ai-sdk/` alone stopped
 * only the harder path (constructing a new provider client); the easier one,
 * reusing the model `tiers.ts` already built, went unchecked.
 *
 * FOUR IMPORT FORMS ARE CHECKED, not just `from "…"`: a side effect import
 * (`import "@ai-sdk/x"`), a dynamic import (`import("@ai-sdk/x")`), and
 * `require("@ai-sdk/x")` each reach the same package without ever writing
 * `from`, so a regex anchored only on that keyword would miss them.
 */
describe("no file other than tiers.ts and client.ts imports an @ai-sdk/ or ai package (covers AC-3)", () => {
  const root = (path: string): string =>
    fileURLToPath(new URL(`../../../${path}`, import.meta.url));

  function sourceFiles(directory: string): readonly string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(path);
      if (!/\.tsx?$/.test(entry.name)) return [];
      if (/\.test\.tsx?$/.test(entry.name)) return [];
      return [path];
    });
  }

  const ALLOWED_FILES = [
    "/src/lib/ai/tiers.ts",
    "/src/lib/ai/client.ts",
  ] as const;

  const files = sourceFiles(root("src")).filter(
    (path) => !ALLOWED_FILES.some((allowed) => path.endsWith(allowed)),
  );

  it("walks the real source tree, so the check is not vacuous", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  /** The package name, quoted, either bare `ai` or an `@ai-sdk/…` scope. */
  const PACKAGE = String.raw`(@ai-sdk\/[^"']+|ai)`;

  const OFFENDER_PATTERNS = [
    new RegExp(String.raw`from\s+["']${PACKAGE}["']`), // import x from "ai"
    new RegExp(String.raw`import\s+["']${PACKAGE}["']`), // import "ai" (side effect)
    new RegExp(String.raw`import\s*\(\s*["']${PACKAGE}["']`), // await import("ai")
    new RegExp(String.raw`require\s*\(\s*["']${PACKAGE}["']`), // require("ai")
  ];

  it("imports no @ai-sdk/ or ai package outside tiers.ts and client.ts", () => {
    const offenders = files.filter((path) => {
      const code = readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      return OFFENDER_PATTERNS.some((pattern) => pattern.test(code));
    });

    expect(
      offenders,
      "Only src/lib/ai/tiers.ts and src/lib/ai/client.ts may import an @ai-sdk/ or ai package. A caller that imports one directly, or that calls generateObject on a model pulled from TIERS, bypasses the usage gate and every fixed generation parameter. Call src/lib/ai/client.ts's callTier() instead.",
    ).toEqual([]);
  });
});
