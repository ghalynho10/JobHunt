import { readFile, rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildEvalReport,
  formatReportTable,
  writeEvalReport,
  type EvalReport,
} from "../eval/report";

import { pairVerdict, type RerunOutcome } from "./eval-verdict";

/**
 * The eval report's printed table and its JSON file (spec 0017, AC-3, AC-5,
 * AC-6, AC-8, AC-9).
 *
 * WHY THIS FILE LIVES IN `test/helpers/` AND NOT BESIDE THE MODULE IT TESTS.
 * `test/eval/` is the paid project: everything matching `test/eval/**` runs only
 * under `pnpm eval`, behind `require-stack`, and one file there spends 80 real
 * vendor calls. A test for the report writer needs none of that, and putting it
 * beside `report.ts` would either hide it behind the paid command or, far
 * worse, tempt someone into widening the free suite's `include` to reach it and
 * pull the harness itself into `pnpm test`. The unit project's `include`
 * already covers every test file under `test/helpers`, so the test sits here
 * and imports across.
 *
 * NOTHING HERE CALLS A VENDOR OR NEEDS THE STACK. The report module's only real
 * dependencies are the filesystem and the values handed to it.
 */

/** Report file paths this run created, deleted afterwards. */
const written: string[] = [];

afterEach(async () => {
  while (written.length > 0) {
    const path = written.pop();
    if (path !== undefined) await rm(path, { force: true });
  }
});

const scored = (band: "strong_match" | "good_match"): RerunOutcome => ({
  kind: "scored",
  band,
});

/**
 * Verdicts are built through the real `pairVerdict()` rather than written out
 * as object literals, so a change to the verdict shape cannot leave this file
 * asserting against a shape nothing produces any more.
 */
const passingVerdict = pairVerdict({
  pairId: "control-direct-match",
  expectedBand: "strong_match",
  tags: ["control"],
  outcomes: [
    scored("strong_match"),
    scored("strong_match"),
    scored("strong_match"),
    scored("strong_match"),
    scored("strong_match"),
  ],
});

const inconclusiveVerdict = pairVerdict({
  pairId: "control-one-gap",
  expectedBand: "good_match",
  tags: ["control"],
  outcomes: [
    scored("good_match"),
    { kind: "failed", detail: "external_service_failed: no answer" },
    { kind: "failed", detail: "external_service_failed: no answer" },
    { kind: "failed", detail: "external_service_failed: no answer" },
    { kind: "failed", detail: "response_malformed: bad shape" },
  ],
});

/** A complete report, which each test then varies one field of. */
function reportWith(overrides: Partial<EvalReport> = {}): EvalReport {
  return {
    startedAt: "2026-09-08T10:00:00.000Z",
    finishedAt: "2026-09-08T10:02:03.456Z",
    filter: null,
    skipped: [],
    incomplete: [],
    model: "some-model-id",
    bandAnchorsHash: "abc123def456",
    status: "completed",
    pairs: [passingVerdict],
    preferenceLeak: { kind: "consistent", band: "strong_match" },
    ...overrides,
  };
}

describe("formatReportTable, the run header (covers AC-9)", () => {
  it("names the model and the band anchors hash it was measured against", () => {
    const table = formatReportTable(reportWith());

    expect(table).toContain(
      "Eval run against some-model-id, band anchors abc123def456",
    );
  });

  /**
   * AC-8: a partial report must never read like a full one. These are the two
   * lines a reader uses to tell them apart at a glance.
   */
  it("says the run was unfiltered when no filter was given", () => {
    expect(formatReportTable(reportWith())).toContain(
      "filter: none (full set)",
    );
  });

  it("names the filter when one was given", () => {
    const table = formatReportTable(reportWith({ filter: "stability-probe" }));

    expect(table).toContain("filter: stability-probe");
    expect(table).not.toContain("none (full set)");
  });
});

describe("formatReportTable, the per pair rows (covers AC-6)", () => {
  it("prints the status, the pair id and the bands observed", () => {
    const table = formatReportTable(reportWith());

    expect(table).toMatch(
      /^ {2}PASS {2,}control-direct-match {2}strong_match, 5 of 5 succeeded$/m,
    );
  });

  /**
   * THE BUG THIS PINS, found in review on 2026-09-08. `INCONCLUSIVE` is
   * exactly twelve characters, so the twelve wide status column padded it by
   * nothing and printed `INCONCLUSIVEcontrol-one-gap`, the pair id glued
   * straight onto the status. Every shorter status kept its gap, so the table
   * looked correct in every other row and in the one test that sampled a PASS
   * row, while the row a reader most needs to pick out was the broken one.
   *
   * ASSERTED AS THE GAP THE READER SEES, not as the constant the code sets, and
   * over every status the table can print rather than one example. A test that
   * hard coded the new width would re-create exactly the drift that hid this.
   */
  it("always leaves a gap between the status and what follows it, longest status included", () => {
    const table = formatReportTable(
      reportWith({
        pairs: [passingVerdict, inconclusiveVerdict],
        skipped: ["preference-match"],
        incomplete: ["key-domain-mismatch"],
      }),
    );

    const labelled = table
      .split("\n")
      .filter((line) =>
        /^ {2}(PASS|FAIL|INCONCLUSIVE|SKIPPED|INCOMPLETE)/.test(line),
      );

    expect(labelled).toHaveLength(4);

    for (const line of labelled) {
      expect(line).toMatch(
        /^ {2}(PASS|FAIL|INCONCLUSIVE|SKIPPED|INCOMPLETE) {2,}\S/,
      );
    }

    /** One column for every status, which is what "a column" means. */
    const prefixes = new Set(
      labelled.map((line) => /^ {2}[A-Z]+ +/.exec(line)?.[0].length),
    );

    expect(prefixes.size).toBe(1);
  });

  /**
   * THE AC-6 INVARIANT, ASSERTED OVER EVERY ROW RATHER THAN ONE EXAMPLE. A
   * reader must never be shown a band without the denominator it rests on, so
   * this walks every rendered pair row instead of trusting a single case.
   */
  it("never renders a pair row without its denominator", () => {
    const table = formatReportTable(
      reportWith({ pairs: [passingVerdict, inconclusiveVerdict] }),
    );

    const pairRows = table
      .split("\n")
      .filter((line) => /^ {2}(PASS|FAIL|INCONCLUSIVE)/.test(line));

    expect(pairRows).toHaveLength(2);
    for (const row of pairRows) expect(row).toMatch(/\d+ of \d+ succeeded/);
  });

  it("names why a pair was inconclusive rather than leaving the reader to guess", () => {
    const table = formatReportTable(
      reportWith({ pairs: [inconclusiveVerdict] }),
    );

    expect(table).toContain("INCONCLUSIVE");
    expect(table).toContain("(insufficient-successes)");
  });

  /**
   * The no silent failures rule, and the exact gap the first real run exposed:
   * a row reading "1 of 5 succeeded" with no cause gives the reader nowhere to
   * go next. Each distinct cause is printed with how many times it happened.
   */
  it("prints each distinct vendor failure cause beneath the row, with its count", () => {
    const table = formatReportTable(
      reportWith({ pairs: [inconclusiveVerdict] }),
    );

    expect(table).toContain("failed 3x: external_service_failed: no answer");
    expect(table).toContain("failed 1x: response_malformed: bad shape");
  });

  it("renders a report with no pairs at all without breaking", () => {
    const table = formatReportTable(reportWith({ pairs: [] }));

    expect(table).toContain("Eval run against some-model-id");
    expect(table).toContain("run completed");
  });
});

describe("formatReportTable, skipped against incomplete (covers AC-3, AC-8)", () => {
  it("lists filtered out pairs as skipped", () => {
    const table = formatReportTable(
      reportWith({ skipped: ["preference-match", "preference-violation"] }),
    );

    expect(table).toMatch(
      /^ {2}SKIPPED {2,}preference-match, preference-violation$/m,
    );
  });

  /**
   * THE TWO ARE REPORTED SEPARATELY ON PURPOSE. "The filter excluded it" and
   * "the run was cut off underneath it" are different facts, and folding them
   * together would describe an aborted run as a filtered one.
   */
  it("lists cut off pairs as incomplete, distinctly from skipped", () => {
    const table = formatReportTable(
      reportWith({
        skipped: ["preference-match"],
        incomplete: ["key-domain-mismatch"],
      }),
    );

    expect(table).toMatch(/^ {2}SKIPPED {2,}preference-match$/m);
    expect(table).toMatch(/^ {2}INCOMPLETE {2,}key-domain-mismatch$/m);
  });

  it("omits both lines when neither applies", () => {
    const table = formatReportTable(reportWith());

    expect(table).not.toContain("SKIPPED");
    expect(table).not.toContain("INCOMPLETE");
  });
});

describe("formatReportTable, the run outcome (covers AC-3)", () => {
  it("says the run completed when nothing aborted it", () => {
    expect(formatReportTable(reportWith())).toContain("run completed");
  });

  /**
   * AC-3: a usage gate refusal must be reported as exactly what it is. The
   * whole point is that an operator condition never reads as evidence about the
   * rubric, so the abort line names the reason and the word "inconclusive"
   * appears nowhere.
   */
  it("names the refusal reason when the run aborted, and calls nothing inconclusive", () => {
    const table = formatReportTable(
      reportWith({
        status: "aborted",
        aborted: "global_day_cap_reached",
        pairs: [],
        incomplete: ["control-direct-match"],
      }),
    );

    expect(table).toContain("RUN ABORTED: global_day_cap_reached");
    expect(table).not.toContain("run completed");
    expect(table).not.toContain("inconclusive");
  });
});

describe("formatReportTable, the preference leak line (covers AC-5)", () => {
  it("reports agreement plainly when all three pairs agree", () => {
    const table = formatReportTable(reportWith());

    expect(table).toContain(
      "preference leak check: consistent, all three on strong_match",
    );
  });

  /**
   * A drift and a leak look alike and have opposite causes, so the two lines
   * have to be distinguishable at a glance and each has to say which way to
   * look. This is the finding the trio of pairs exists to make legible.
   */
  it("reports baseline drift as a rubric or model question, not a leak", () => {
    const table = formatReportTable(
      reportWith({
        preferenceLeak: {
          kind: "baseline-drift",
          band: "good_match",
          expectedBand: "strong_match",
        },
      }),
    );

    expect(table).toContain("BASELINE DRIFT, all three on good_match");
    expect(table).toContain("The rubric or the model moved, not a preference.");
    expect(table).not.toContain("PREFERENCE LEAK SUSPECTED");
  });

  it("reports a suspected leak, naming every pair that diverged", () => {
    const table = formatReportTable(
      reportWith({
        preferenceLeak: {
          kind: "preference-leak-suspected",
          baselineBand: "strong_match",
          divergent: [
            { pairId: "preference-violation", band: "good_match" },
            { pairId: "preference-title-conflict", band: "possible_match" },
          ],
        },
      }),
    );

    expect(table).toContain("PREFERENCE LEAK SUSPECTED, baseline strong_match");
    expect(table).toContain("preference-violation good_match");
    expect(table).toContain("preference-title-conflict possible_match");
  });

  it("says the check was skipped, and why, when it could not run", () => {
    const table = formatReportTable(
      reportWith({
        preferenceLeak: {
          kind: "leak-check-skipped",
          detail: "preference-match did not run.",
        },
      }),
    );

    expect(table).toContain(
      "preference leak check: skipped, preference-match did not run.",
    );
  });
});

/**
 * The run's own assembly (spec 0017, AC-3, AC-8, AC-9).
 *
 * WHY THESE EXIST AT ALL. This logic used to sit inline in the `afterAll` of
 * `test/eval/harness.test.ts`, which is the paid project: proving anything
 * about it meant spending 80 vendor calls, so in practice nothing ever did, and
 * the review on 2026-09-08 found a real defect living in exactly that gap.
 * Pulled into `buildEvalReport()`, every branch is now free to drive, including
 * the one no successful run ever reaches.
 */
function buildWith(
  overrides: Partial<Parameters<typeof buildEvalReport>[0]> = {},
): EvalReport {
  return buildEvalReport({
    startedAt: "2026-09-08T10:00:00.000Z",
    finishedAt: "2026-09-08T10:02:03.456Z",
    filter: null,
    pairIds: ["control-direct-match", "control-one-gap"],
    attempted: new Set<string>(),
    verdicts: new Map(),
    model: "some-model-id",
    bandAnchorsHash: "abc123def456",
    abortReason: undefined,
    setupFailure: undefined,
    preferenceLeak: { kind: "consistent", band: "strong_match" },
    ...overrides,
  });
}

describe("buildEvalReport, a setup that never finished (covers AC-9)", () => {
  /**
   * THE REGRESSION THIS FILE EXISTS FOR, found in review on 2026-09-08.
   *
   * Vitest runs `afterAll` even when `beforeAll` threw. Confirmed against the
   * installed 4.1.11 with a scratch probe: the hook ran with nothing attempted
   * while the runner reported every test skipped. The harness then wrote a
   * report from its untouched defaults, `status: "completed"` with `filter:
   * null` and all sixteen pairs listed `skipped`, which is a run that never
   * started described as a full run that scored nothing. The terminal was
   * honest (the exit code was non zero) while the file on disk, the artifact
   * spec 0017 says people compare weeks later, was not.
   */
  it("never describes a run that never started as a completed one", () => {
    const report = buildWith({
      setupFailure: "The local Supabase stack is not running.",
    });

    expect(report.status).toBe("not-started");
    expect(formatReportTable(report)).not.toContain("run completed");
  });

  /**
   * `skipped` MEANS "THE FILTER EXCLUDED THIS PAIR" AND NOTHING ELSE. Listing
   * every pair there on a run that never started says a full set was considered
   * and filtered away, which is the same collapse of two different facts that
   * `incomplete` was split out from `skipped` to prevent.
   */
  it("lists no pair as skipped, because none was ever considered", () => {
    const report = buildWith({ setupFailure: "The mint failed." });

    expect(report.skipped).toEqual([]);
    expect(report.incomplete).toEqual([]);
    expect(report.pairs).toEqual([]);
  });

  it("carries the reason setup failed, so the file says why", () => {
    const report = buildWith({
      setupFailure: "The committed ground truth set is invalid.",
    });

    expect(report.notStarted).toBe(
      "The committed ground truth set is invalid.",
    );
  });

  /**
   * THE ASSERTION IS THE WHOLE LINE, NOT A SUBSTRING OF IT, and that is the
   * point. This test used to read `toContain("RUN NOT STARTED: The mint
   * failed.")`, which passed while the real output said `The mint failed..
   * Nothing was scored.`: the substring matched the first period and never
   * looked at what followed. The fixture was realistic all along; the check
   * simply could not see the defect it rendered. Same shape as the salary leak
   * guard that searched for `191919` while the render said `191,919`.
   */
  it("says the run never started, naming the cause, where it would say completed", () => {
    const table = formatReportTable(
      buildWith({ setupFailure: "The mint failed." }),
    );

    expect(table).toContain(
      "  RUN NOT STARTED: The mint failed. Nothing was scored.",
    );
    expect(table).not.toContain("inconclusive");
  });

  /**
   * A reason is a real `Error.message`, and both throw sites that can set one
   * end it in a period, so the appended sentence doubled it. Asserted as "no
   * doubled period anywhere in the render" rather than against one example,
   * because the next reason to reach this line will be a different sentence.
   */
  it("never doubles the period when the reason already ends in one", () => {
    const table = formatReportTable(
      buildWith({
        setupFailure:
          "The committed ground truth set is invalid, so nothing was scored and no vendor call was made.",
      }),
    );

    expect(table).not.toContain("..");
    expect(table).toContain(
      "  RUN NOT STARTED: The committed ground truth set is invalid, so nothing was scored and no vendor call was made. Nothing was scored.",
    );
  });

  /**
   * The other half of the same rule: normalising must not eat a period the
   * reader still needs. A reason with none gets exactly one, from the appended
   * sentence, and never zero.
   */
  it("still ends the reason in a period when it had none", () => {
    const table = formatReportTable(
      buildWith({ setupFailure: "The mint failed" }),
    );

    expect(table).toContain(
      "  RUN NOT STARTED: The mint failed. Nothing was scored.",
    );
    expect(table).not.toContain("..");
  });

  /**
   * A setup failure outranks every other signal. Without this the two could
   * disagree, and an abort reason left over from a previous concern would
   * decide the status of a run that never began.
   */
  it("outranks an abort reason when both are somehow present", () => {
    const report = buildWith({
      setupFailure: "The mint failed.",
      abortReason: "global_day_cap_reached",
    });

    expect(report.status).toBe("not-started");
    expect(report.aborted).toBeUndefined();
  });
});

describe("buildEvalReport, a run that did start (covers AC-3, AC-8)", () => {
  it("marks a clean run completed, with no not-started reason on it", () => {
    const report = buildWith({
      attempted: new Set(["control-direct-match", "control-one-gap"]),
      verdicts: new Map([
        ["control-direct-match", passingVerdict],
        ["control-one-gap", inconclusiveVerdict],
      ]),
    });

    expect(report.status).toBe("completed");
    expect(report.notStarted).toBeUndefined();
    expect(report.pairs).toEqual([passingVerdict, inconclusiveVerdict]);
  });

  it("counts a pair the filter never reached as skipped", () => {
    const report = buildWith({
      attempted: new Set(["control-direct-match"]),
      verdicts: new Map([["control-direct-match", passingVerdict]]),
    });

    expect(report.skipped).toEqual(["control-one-gap"]);
    expect(report.incomplete).toEqual([]);
  });

  /**
   * AC-3: a pair that started and produced no verdict was cut off, which is a
   * different fact from one the filter excluded, and the two must never merge.
   */
  it("counts a pair that started without finishing as incomplete, not skipped", () => {
    const report = buildWith({
      attempted: new Set(["control-direct-match", "control-one-gap"]),
      verdicts: new Map([["control-direct-match", passingVerdict]]),
      abortReason: "kill_switch_engaged",
    });

    expect(report.incomplete).toEqual(["control-one-gap"]);
    expect(report.skipped).toEqual([]);
    expect(report.status).toBe("aborted");
    expect(report.aborted).toBe("kill_switch_engaged");
  });
});

describe("writeEvalReport (covers AC-9)", () => {
  it("writes a file named for the finish time, with colons replaced by dashes", async () => {
    const path = await writeEvalReport(reportWith());
    written.push(path);

    expect(path).toContain("2026-09-08T10-02-03.456Z.json");
    expect(path).not.toContain("10:02:03");
  });

  it("writes the whole report back as readable JSON", async () => {
    const report = reportWith({ filter: "control", skipped: ["a", "b"] });
    const path = await writeEvalReport(report);
    written.push(path);

    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));

    expect(parsed).toEqual(report);
  });

  /**
   * THE REGRESSION THIS TEST EXISTS FOR. `JSON.stringify` drops a key whose
   * value is `undefined`, so an unfiltered run originally wrote a report with
   * no `filter` key at all, leaving the reader to infer "absent means full run".
   * AC-8 exists to remove exactly that inference, so the null has to survive
   * serialisation, not just the type.
   */
  it("keeps an unfiltered run's filter as an explicit null in the file", async () => {
    const path = await writeEvalReport(reportWith({ filter: null }));
    written.push(path);

    const raw = await readFile(path, "utf8");

    expect(raw).toContain('"filter": null');
  });

  it("records every pair's denominator and distribution in the file", async () => {
    const path = await writeEvalReport(reportWith());
    written.push(path);

    const parsed = JSON.parse(await readFile(path, "utf8")) as EvalReport;
    const [pair] = parsed.pairs;

    expect(pair?.denominator).toBe(5);
    expect(pair?.successes).toBe(5);
    expect(pair?.distribution).toEqual({ strong_match: 5 });
  });
});
