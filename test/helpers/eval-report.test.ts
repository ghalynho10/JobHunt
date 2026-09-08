import { readFile, rm } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import {
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

    expect(table).toContain(
      "PASS        control-direct-match  strong_match, 5 of 5 succeeded",
    );
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

    expect(table).toContain(
      "SKIPPED     preference-match, preference-violation",
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

    expect(table).toContain("SKIPPED     preference-match");
    expect(table).toContain("INCOMPLETE  key-domain-mismatch");
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
