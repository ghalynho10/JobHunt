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
  /**
   * What became of the run as a whole.
   *
   * `not-started` EXISTS BECAUSE `afterAll` RUNS EVEN WHEN `beforeAll` THREW.
   * Verified against the installed Vitest 4.1.11 with a scratch probe on
   * 2026-09-08: the hook ran with nothing attempted while the runner reported
   * every test skipped. Without this third value the untouched defaults wrote
   * `completed` with all sixteen pairs listed `skipped`, describing a run that
   * never started as a full run that scored nothing. That is the "default that
   * reads like success" this project's no silent failures rule forbids, and it
   * is the same distinction `skipped` and `incomplete` are kept apart for.
   */
  readonly status: "completed" | "aborted" | "not-started";
  /** Present only when `status` is `aborted` (AC-3). */
  readonly aborted?: UsageGateReason;
  /** Present only when `status` is `not-started`: why setup never finished. */
  readonly notStarted?: string;
  readonly pairs: readonly PairVerdict[];
  readonly preferenceLeak: PreferenceLeakOutcome;
}

/** Where reports land. Gitignored: these are local measurements, not source. */
const OUTPUT_DIRECTORY = fileURLToPath(new URL("./.output/", import.meta.url));

/**
 * The width of the table's status column.
 *
 * IT MUST STAY WIDER THAN THE LONGEST STATUS WORD, never merely equal to it.
 * `INCONCLUSIVE` is exactly twelve characters, so the twelve wide column this
 * replaces padded it by nothing and glued the status straight onto the pair id
 * (`INCONCLUSIVEcontrol-one-gap`), while every shorter status kept its gap.
 * Found in review on 2026-09-08. The four places that must agree all derive
 * from this one constant now, because their drifting apart as separate
 * literals is what let the row render wrong with a test seemingly over it.
 */
const STATUS_COLUMN_WIDTH = 14;

/** The two spaces every table row is indented by. */
const ROW_INDENT = 2;

/**
 * Assembles the run's report from what the harness observed (AC-3, AC-8, AC-9).
 *
 * IT IS A PURE FUNCTION AND NOT INLINE IN THE `afterAll` FOR ONE REASON: the
 * paid project cannot be run to test it. Everything under `test/eval/` costs 80
 * vendor calls, so orchestration written inline there is provable only by
 * spending money, which means in practice it was never proved at all. Here the
 * free suite drives every branch, including the one below that no passing run
 * ever reaches.
 *
 * @param input What the run observed. `setupFailure` set means `beforeAll`
 *   never finished, which outranks every other signal.
 * @returns The report, ready to write and to print.
 */
export function buildEvalReport(input: {
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly filter: string | null;
  readonly pairIds: readonly string[];
  readonly attempted: ReadonlySet<string>;
  readonly verdicts: ReadonlyMap<string, PairVerdict>;
  readonly model: string;
  readonly bandAnchorsHash: string;
  readonly abortReason: UsageGateReason | undefined;
  readonly setupFailure: string | undefined;
  readonly preferenceLeak: PreferenceLeakOutcome;
}): EvalReport {
  const base = {
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    filter: input.filter,
    model: input.model,
    bandAnchorsHash: input.bandAnchorsHash,
    preferenceLeak: input.preferenceLeak,
  };

  /**
   * SETUP FAILED, SO NO PAIR WAS EVER ELIGIBLE TO RUN. `skipped` stays empty on
   * purpose: it means "the filter excluded this pair", and listing all sixteen
   * there would say a full set was considered and filtered away when in truth
   * nothing was ever considered. The reason field carries the actual cause.
   */
  if (input.setupFailure !== undefined) {
    return {
      ...base,
      skipped: [],
      incomplete: [],
      status: "not-started",
      notStarted: input.setupFailure,
      pairs: [],
    };
  }

  return {
    ...base,
    skipped: input.pairIds.filter((pairId) => !input.attempted.has(pairId)),
    incomplete: [...input.attempted].filter(
      (pairId) => !input.verdicts.has(pairId),
    ),
    status: input.abortReason === undefined ? "completed" : "aborted",
    ...(input.abortReason === undefined ? {} : { aborted: input.abortReason }),
    pairs: input.pairIds.flatMap((pairId) => {
      const verdict = input.verdicts.get(pairId);
      return verdict === undefined ? [] : [verdict];
    }),
  };
}

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
    const status = verdict.status.toUpperCase().padEnd(STATUS_COLUMN_WIDTH);
    const reason =
      verdict.inconclusiveReason === undefined
        ? ""
        : ` (${verdict.inconclusiveReason})`;

    const row = `${" ".repeat(ROW_INDENT)}${status}${verdict.pairId.padEnd(width)}  ${verdict.summary}${reason}`;

    /**
     * A failure count with no cause beside it is the silent failure this
     * project forbids: the reader sees "0 of 5 succeeded" and has nowhere to go
     * next. Each distinct cause gets its own indented line under the row.
     */
    const causes = Object.entries(verdict.failureDetails).map(
      ([detail, count]) =>
        `${" ".repeat(ROW_INDENT + STATUS_COLUMN_WIDTH + width)}  failed ${count}x: ${detail}`,
    );

    return [row, ...causes];
  });

  if (report.skipped.length > 0) {
    lines.push(
      `${" ".repeat(ROW_INDENT)}${"SKIPPED".padEnd(STATUS_COLUMN_WIDTH)}${report.skipped.join(", ")}`,
    );
  }

  if (report.incomplete.length > 0) {
    lines.push(
      `${" ".repeat(ROW_INDENT)}${"INCOMPLETE".padEnd(STATUS_COLUMN_WIDTH)}${report.incomplete.join(", ")}`,
    );
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
    describeOutcome(report),
    "",
  ].join("\n");
}

/**
 * The run's last line, the one a reader takes the whole run's word from.
 *
 * EACH STATUS GETS ITS OWN SENTENCE, and `not-started` is never allowed to fall
 * through to `run completed`. A run whose setup threw prints why it never
 * began, so the file on disk and the terminal say the same thing.
 */
function describeOutcome(report: EvalReport): string {
  switch (report.status) {
    case "aborted":
      return `  RUN ABORTED: ${report.aborted ?? "unknown reason"}`;
    case "not-started": {
      /**
       * THE REASON IS A REAL `Error.message`, SO IT USUALLY ENDS IN A PERIOD
       * ALREADY, and appending a sentence to it printed `at all.. Nothing was
       * scored.` Both throw sites that can set it end their message that way:
       * the `validateGroundTruth` issue list, whose every issue message ends in
       * a period, and AC-5's preference id check. Normalising here rather than
       * at each throw site keeps the rule in one place, where the sentence is
       * actually appended, instead of asking every future caller to remember.
       */
      const reason = (report.notStarted ?? "unknown reason")
        .trimEnd()
        .replace(/\.+$/, "");

      return `  RUN NOT STARTED: ${reason}. Nothing was scored.`;
    }
    case "completed":
      return "  run completed";
  }
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
