import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TIERS, resolvedModel } from "./tiers";

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
 * The guard this test used to define itself now lives in `tiers.ts` and is
 * imported above. Spec 0017's eval harness needs the same narrowing to report
 * which model answered, and two copies that agree today are exactly what that
 * spec's AC-9 refuses ("so that is true by construction rather than by two
 * separate implementations agreeing").
 */
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
      openai: { reasoningEffort: "medium", store: false },
    });
  });

  /**
   * Spec 0015, Follow-up (resolved 2026-09-06): `ai_scoring` opts out of
   * OpenAI's 30 day retention of request and response bodies.
   *
   * WHY THIS IS ITS OWN TEST RATHER THAN JUST THE `toEqual` ABOVE. That
   * assertion pins the whole options object, so it would catch this being
   * removed, but it would report the removal as "the provider options changed"
   * and the next person would fix it by updating the expected object. This one
   * names the guarantee, so deleting `store: false` fails a test that says what
   * was actually lost: a real person's summary, skills and work history sitting
   * on a vendor's disk for a month.
   *
   * IT MUST BE `false`, NOT MERELY ABSENT. The Responses API defaults `store`
   * to `true` (`node_modules/@ai-sdk/openai/docs/03-openai.mdx:156`), so an
   * omitted option is the storing behaviour, not the safe one. `toBe(false)`
   * rather than a falsy check for exactly that reason: `undefined` is the
   * failure this guards.
   */
  it("opts ai_scoring out of OpenAI's 30 day retention with store: false", () => {
    expect(TIERS.ai_scoring.providerOptions?.["openai"]?.["store"]).toBe(false);
  });

  /**
   * THE COUNTERWEIGHT, and it is not symmetry for its own sake. `store` is an
   * OpenAI Responses API option; Google's provider does not accept it, and
   * copying it onto `ai_check` would send an unrecognised key to a different
   * vendor. `ai_check`'s own retention question is Google's to answer and has
   * not been asked, which is a real open item rather than something this test
   * settles.
   */
  it("sets no provider options at all on ai_check, which is a different vendor", () => {
    expect(TIERS.ai_check.providerOptions).toBeUndefined();
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
