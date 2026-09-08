import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { UsageGateReason } from "@/lib/usage-gating/gate";

import type {
  PairVerdict,
  PreferenceLeakOutcome,
} from "../helpers/eval-verdict";

/**
 * The eval run's own artifact: one JSON file per run, plus the console table
 * (spec 0017, AC-1, AC-6, AC-9).
 *
 * WHY A FILE AT ALL, WHEN THE TABLE IS ALREADY PRINTED. A run costs real money
 * (80 vendor calls for the full set) and the question it answers, "did the
 * scorer change, or did the rubric", can only be asked by comparing two runs
 * weeks apart. Terminal scrollback is not that. The model id and the anchor
 * hash ride along in every report for exactly that comparison.
 *
 * THE FORMAT IS NOT A CONTRACT. Spec 0017 records it as a plain structural
 * artifact for a human to read or diff, deliberately unversioned and not schema
 * checked. If something ever consumes these files (a dashboard, a CI gate),
 * that is its own decision to take then.
 */

export interface EvalReport {
  readonly startedAt: string;
  readonly finishedAt: string;
  /**
   * The `-t` pattern this run was invoked with, or `null` for a full run
   * (AC-8). Recorded so a partial report can never be mistaken for a full one.
   *
   * `null`, NOT `undefined`, AND THAT IS THE WHOLE POINT OF THE FIELD.
   * `JSON.stringify` drops an `undefined` value, so the first full run wrote a
   * report with no `filter` key at all (caught 2026-09-08): the reader then has
   * to know that an absent key means a full run, which is exactly the silent
   * inference AC-8 exists to remove. `null` says it out loud.
   */
  readonly filter: string | null;
  /** Pairs the filter excluded, so an absent pair is never silently absent. */
  readonly skipped: readonly string[];
  /**
   * Pairs that started but produced no verdict, which today means the run
   * aborted underneath them. Separate from `skipped` because "the filter
   * excluded it" and "the run was cut off" are different facts, and folding
   * them together would describe an aborted run as a filtered one.
   */
  readonly incomplete: readonly string[];
  /** Read off `TIERS.ai_scoring`, never typed into the harness (AC-9, AC-11). */
  readonly model: string;
  /** `bandAnchorsHash(BAND_ANCHORS)`, the same function the AC-10 test uses. */
  readonly bandAnchorsHash: string;
  readonly status: "completed" | "aborted";
  /** Present only when `status` is `aborted` (AC-3). */
  readonly aborted?: UsageGateReason;
  readonly pairs: readonly PairVerdict[];
  readonly preferenceLeak: PreferenceLeakOutcome;
}

/** Where reports land. Gitignored: these are local measurements, not source. */
const OUTPUT_DIRECTORY = fileURLToPath(new URL("./.output/", import.meta.url));

/**
 * Renders the per pair table AC-1 asks the command to print.
 *
 * IT PRINTS `summary`, NOT `band`, WHICH IS AC-6 HOLDING. Every line carries
 * the bands observed together with the denominator they rest on, so a verdict
 * from three of three successes cannot be read as one from five of five, and a
 * pair that passed on a split still shows the split.
 *
 * @param report The finished report.
 * @returns The whole block, ready to print.
 */
export function formatReportTable(report: EvalReport): string {
  const width = Math.max(
    0,
    ...report.pairs.map((verdict) => verdict.pairId.length),
  );

  const lines = report.pairs.flatMap((verdict) => {
    const status = verdict.status.toUpperCase().padEnd(12);
    const reason =
      verdict.inconclusiveReason === undefined
        ? ""
        : ` (${verdict.inconclusiveReason})`;

    const row = `  ${status}${verdict.pairId.padEnd(width)}  ${verdict.summary}${reason}`;

    /**
     * A failure count with no cause beside it is the silent failure this
     * project forbids: the reader sees "0 of 5 succeeded" and has nowhere to go
     * next. Each distinct cause gets its own indented line under the row.
     */
    const causes = Object.entries(verdict.failureDetails).map(
      ([detail, count]) =>
        `${" ".repeat(14 + width)}  failed ${count}x: ${detail}`,
    );

    return [row, ...causes];
  });

  if (report.skipped.length > 0) {
    lines.push(`  SKIPPED     ${report.skipped.join(", ")}`);
  }

  if (report.incomplete.length > 0) {
    lines.push(`  INCOMPLETE  ${report.incomplete.join(", ")}`);
  }

  return [
    "",
    `Eval run against ${report.model}, band anchors ${report.bandAnchorsHash}`,
    report.filter === null
      ? "  filter: none (full set)"
      : `  filter: ${report.filter}`,
    "",
    ...lines,
    "",
    `  preference leak check: ${describeLeak(report.preferenceLeak)}`,
    report.status === "aborted"
      ? `  RUN ABORTED: ${report.aborted ?? "unknown reason"}`
      : "  run completed",
    "",
  ].join("\n");
}

/** One readable line for each of the leak check's four outcomes (AC-5). */
function describeLeak(outcome: PreferenceLeakOutcome): string {
  switch (outcome.kind) {
    case "leak-check-skipped":
      return `skipped, ${outcome.detail}`;
    case "consistent":
      return `consistent, all three on ${outcome.band}`;
    case "baseline-drift":
      return `BASELINE DRIFT, all three on ${outcome.band}, expected ${outcome.expectedBand}. The rubric or the model moved, not a preference.`;
    case "preference-leak-suspected":
      return `PREFERENCE LEAK SUSPECTED, baseline ${outcome.baselineBand} but ${outcome.divergent.map((pair) => `${pair.pairId} ${pair.band}`).join(", ")}. The requirements text is identical across these, so only the preference text can explain it.`;
  }
}

/**
 * Writes one report, creating the output directory if it is not there (AC-9).
 *
 * COLONS BECOME DASHES IN THE FILENAME. An ISO timestamp contains `:`, which is
 * not a legal filename character on Windows and is awkward to type on any
 * shell. The timestamp itself stays whole inside the file.
 *
 * @param report The finished report.
 * @returns The absolute path written, so the caller can print it.
 */
export async function writeEvalReport(report: EvalReport): Promise<string> {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });

  const path = `${OUTPUT_DIRECTORY}${report.finishedAt.replaceAll(":", "-")}.json`;

  await writeFile(path, `${JSON.stringify(report, undefined, 2)}\n`, "utf8");

  return path;
}
