import { readFileSync } from "node:fs";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Spec 0020, AC-11: the half of the ordering guard that lint provides.
 *
 * WHAT AC-11 ACTUALLY CLAIMS, AND WHY IT NEEDS A TEST. `UsageNotice` awaits its
 * `searchInFlight` prop before reading usage, and that `await` is the ordering.
 * The spec says two things guard it: the three ordering tests in
 * `src/app/(app)/search/page.test.ts` catch reordering, and lint catches
 * DELETION, because a deleted `await` leaves the prop unused and `pnpm lint`
 * runs at `--max-warnings=0`. The first half is pinned by those tests. The
 * second half was pure assertion until this file: switch the rule off, or widen
 * it, and the guard disappears while every test stays green and the spec goes
 * on promising a protection the repo no longer has.
 *
 * THIS FEATURE HAS ALREADY HAD TWO CLAIMED GUARANTEES TURN OUT NOT TO BE ONE
 * (the prop that did not hold the ordering, then the "two independent guards"
 * wording that a `Promise.all` fold walks straight past). An unverified third
 * is exactly the shape that keeps going wrong here.
 *
 * IT ASSERTS THE OUTCOME, NOT THE CONFIG, and the difference is the whole
 * design. Reading the resolved config and checking that
 * `@typescript-eslint/no-unused-vars` is on with no `argsIgnorePattern` would
 * assert the property the config sets, and would pass while an `ignores` entry,
 * a file specific override, or a disable convention quietly removed the guard
 * by some other route. This runs the real ESLint over source that has the
 * defect, resolved as if it were the real component, and asserts the rule
 * actually reports. Any config change that stops that being true fails here,
 * whatever route it took. (`docs/reflexes.md`, 2026-08-28: assert the outcome
 * the reader experiences, not the property the code sets.)
 */

/** The real component's path, so ESLint resolves the config that governs it. */
const GOVERNED_PATH = "src/features/search/usage-notice.tsx";

/**
 * The two sources differ in ONE thing: whether the prop is used. Anything else
 * differing would make the clean case a weak control, since a pass could then
 * come from some unrelated difference rather than from the prop being used.
 */
const WITH_DEFECT = `export async function Probe({ searchInFlight }: {
  readonly searchInFlight: Promise<unknown> | undefined;
}) {
  return null;
}
`;

const WITHOUT_DEFECT = `export async function Probe({ searchInFlight }: {
  readonly searchInFlight: Promise<unknown> | undefined;
}) {
  if (searchInFlight !== undefined) await searchInFlight;
  return null;
}
`;

const UNUSED_VARS = "@typescript-eslint/no-unused-vars";

async function lintAsComponent(source: string) {
  const results = await new ESLint().lintText(source, {
    filePath: GOVERNED_PATH,
  });
  return results[0]?.messages ?? [];
}

describe("lint is the guard on deleting the await (AC-11)", () => {
  it("reports an unused prop when the await is missing", async () => {
    const messages = await lintAsComponent(WITH_DEFECT);

    expect(messages.map((m) => m.ruleId)).toContain(UNUSED_VARS);
  });

  it("reports nothing at all once the prop is used", async () => {
    /**
     * THE CONTROL, AND IT IS NOT OPTIONAL. A test that only checked an error
     * appears would pass against a config that errors on everything, including
     * one broken so badly it flags correct code. Asserting the clean source is
     * silent is what makes the failing case mean something.
     */
    const messages = await lintAsComponent(WITHOUT_DEFECT);

    expect(messages.map((m) => `${m.ruleId}: ${m.message}`)).toEqual([]);
  });

  it("fails the build rather than merely warning, because lint runs at --max-warnings=0", async () => {
    /**
     * THE SEVERITY DOES NOT MATTER, THE EXIT CODE DOES. This rule is configured
     * as a warning, and a warning would normally let a build through. It does
     * not here, because `pnpm lint` is `eslint . --max-warnings=0`. Both halves
     * have to hold for AC-11's claim to be true, so both are asserted: the rule
     * reports, AND the script that runs it treats a report as failure.
     */
    const messages = await lintAsComponent(WITH_DEFECT);
    expect(messages.length).toBeGreaterThan(0);

    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      readonly scripts: Readonly<Record<string, string>>;
    };
    expect(pkg.scripts["lint"]).toContain("--max-warnings=0");
  });

  it("still fires on the real component with its await removed", async () => {
    /**
     * THE SYNTHETIC PROBES ABOVE PROVE THE CONFIG BEHAVES; THIS PROVES THE REAL
     * COMPONENT IS STILL SHAPED SO THAT IT BENEFITS. If `UsageNotice` ever stops
     * taking the prop, or stops being the thing that awaits it, this fails and
     * says so, rather than the config test passing happily beside a component
     * the guard no longer covers.
     *
     * Not finding the line to remove is a FAILURE, not a skip: it means the
     * component changed shape and this guard needs re reading.
     */
    const real = readFileSync(GOVERNED_PATH, "utf8");
    const awaitLine = "if (searchInFlight !== undefined) await searchInFlight;";

    expect(
      real,
      `${GOVERNED_PATH} no longer contains the awaited prop this guard is about. If the component was reshaped, spec 0020's AC-11 needs re reading, not this line updating.`,
    ).toContain(awaitLine);

    const messages = await lintAsComponent(real.replace(awaitLine, ""));

    expect(messages.map((m) => m.ruleId)).toContain(UNUSED_VARS);
  });
});
