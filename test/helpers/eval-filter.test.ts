import { describe, expect, it, vi } from "vitest";
import type { TestProject } from "vitest/node";

import { setup } from "../setup/eval-filter";

/**
 * The channel that carries the eval run's own `-t` pattern to the harness
 * (spec 0017, AC-8).
 *
 * WHY THIS IS WORTH A TEST AT ALL. It is four lines, but AC-8's promise rests
 * entirely on them: every report has to record which filter produced it, so a
 * one pair debugging run can never be mistaken for a full sixteen pair run
 * later. If this silently provided nothing, every report would claim to be a
 * full run and nothing else in the system would notice.
 *
 * THE PROJECT IS FAKED, AND THAT IS THE RIGHT BOUNDARY. Vitest's own
 * `TestProject` is the system boundary here; what this function has to get
 * right is which key it provides and what it reads off the config, both of
 * which are observable from a stand in.
 */

/** The two fields `setup()` actually touches, shaped as Vitest hands them over. */
function fakeProject(testNamePattern: RegExp | undefined) {
  const provide = vi.fn();

  const project = {
    config: { testNamePattern },
    provide,
  } as unknown as TestProject;

  return { project, provide };
}

describe("eval-filter globalSetup (covers AC-8)", () => {
  it("provides the filter pattern's own text when the run was filtered", () => {
    const { project, provide } = fakeProject(/control-direct-match/);

    setup(project);

    expect(provide).toHaveBeenCalledWith(
      "evalTestNamePattern",
      "control-direct-match",
    );
  });

  /**
   * `undefined` is what an unfiltered run looks like, and the harness turns it
   * into the report's explicit `null`. Providing nothing at all here would make
   * `inject()` throw instead.
   */
  it("provides undefined when the run carried no filter", () => {
    const { project, provide } = fakeProject(undefined);

    setup(project);

    expect(provide).toHaveBeenCalledWith("evalTestNamePattern", undefined);
  });

  /**
   * A `RegExp` cannot cross into a test worker through Vitest's structured
   * serialisation, so this must hand over the pattern's source text. Providing
   * the object itself would fail at the boundary, far from this file.
   */
  it("hands over a string, never the RegExp object", () => {
    const { project, provide } = fakeProject(/stability-probe/);

    setup(project);

    const [, value] = provide.mock.calls[0] ?? [];

    expect(typeof value).toBe("string");
    expect(value).not.toBeInstanceOf(RegExp);
  });

  it("provides exactly once, under the one key the harness injects", () => {
    const { project, provide } = fakeProject(/control/);

    setup(project);

    expect(provide).toHaveBeenCalledTimes(1);
    expect(provide.mock.calls[0]?.[0]).toBe("evalTestNamePattern");
  });
});
