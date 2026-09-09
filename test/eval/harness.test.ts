import { afterAll, beforeAll, describe, inject, it } from "vitest";

import { bandAnchorsHash } from "@/features/scoring/eval/band-anchors-hash";
import { ARCHETYPES } from "@/features/scoring/eval/archetypes";
import { validateGroundTruth } from "@/features/scoring/eval/ground-truth";
import { PAIRS } from "@/features/scoring/eval/pairs";
import { BAND_ANCHORS } from "@/features/scoring/rubric";
import { scoreListing } from "@/features/scoring/score";
import { resolvedModel, TIERS } from "@/lib/ai/tiers";
import type { UsageGateReason } from "@/lib/usage-gating/gate";

import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import {
  classifyRerun,
  pairVerdict,
  preferenceLeakCheck,
  PREFERENCE_BASELINE_ID,
  validatePreferenceIds,
  type PairVerdict,
  type PreferenceLeakOutcome,
  type RerunOutcome,
} from "../helpers/eval-verdict";
import { mintSession, type MintedSession } from "../helpers/session";
import {
  buildEvalReport,
  formatReportTable,
  writeEvalReport,
  type EvalReport,
} from "./report";

/**
 * The eval harness (spec 0017, AC-1, AC-2, AC-7, AC-8, AC-9, AC-11).
 *
 * THIS FILE SPENDS REAL MONEY EVERY TIME IT RUNS: five vendor calls per pair,
 * 80 for the full set of sixteen. It is reachable only through `pnpm eval`,
 * which names `--project eval` explicitly, and it is in neither `pnpm test` nor
 * `pnpm test:integration`. Debug one pair rather than the set:
 *
 *   pnpm eval -t control-direct-match     five calls
 *   pnpm eval -t preference-isolation     fifteen calls, the whole tag
 *   pnpm eval                             eighty calls, the whole set
 *
 * THE BINDING CEILING IS THE SHARED GLOBAL DAY CAP for `ai_scoring` (1320),
 * NOT the account weekly cap of 500. This harness mints a fresh fixture user
 * every run, so that account's own counter starts at zero each time and can
 * never be what stops it; the global counter is shared with everything else
 * touching this tier, including a local `pnpm dev` session on `/search`.
 *
 * IT IS ONE FILE ON PURPOSE, and the `eval` project's `fileParallelism: false`
 * is what keeps that safe: one minted session, one report writer, one abort
 * flag, all module scoped here. A second file would run in its own worker with
 * its own copy of all three.
 */

/** Spec 0017, AC-2: five reruns per pair, because the model is not fixed. */
const RERUNS_PER_PAIR = 5;

/** The session every call in this run shares. Minted once, never re-minted. */
let session: MintedSession | undefined;
let fixtureUserId: string | undefined;

const startedAt = new Date().toISOString();

/** Every verdict this run produced, keyed by pair id. */
const verdicts = new Map<string, PairVerdict>();

/** Every pair whose test body started, so a cut off pair is not read as filtered. */
const attempted = new Set<string>();

/**
 * The first usage gate refusal seen anywhere in the run (AC-3).
 *
 * ONE REFUSAL STOPS EVERYTHING. A budget or kill switch stop is an operator
 * condition, not evidence about the rubric, and the rest of the run would not
 * reflect real scoring anyway. Every pair still to start, and every pair
 * between its own reruns, reads this and fails naming the reason, rather than
 * the run quietly becoming a wall of `inconclusive` verdicts that would
 * misdescribe what actually happened.
 */
let abortReason: UsageGateReason | undefined;

/**
 * Why the setup did not finish, cleared only once it has (AC-9).
 *
 * IT STARTS SET, AND ONLY A COMPLETED `beforeAll` CLEARS IT. Vitest runs
 * `afterAll` even when `beforeAll` threw, verified against the installed 4.1.11
 * with a scratch probe on 2026-09-08: the hook ran with `attempted=0` while the
 * runner reported `2 skipped`. With the defaults left untouched the report then
 * read `status: "completed"`, `filter: null` and all sixteen pairs `skipped`,
 * which describes a run that never started as a full run that scored nothing,
 * the "default that reads like success" this project's no silent failures rule
 * forbids. Defaulting to a failure means any path that forgets to clear it errs
 * towards saying so rather than towards claiming a run happened.
 */
let setupFailure: string | undefined =
  "The harness setup did not run, so nothing was scored.";

/** Throws with the refusal's own reason if the run has already been aborted. */
function refuseIfAborted(pairId: string): void {
  if (abortReason === undefined) return;

  throw new Error(
    `Run aborted before ${pairId} could finish: the usage gate refused a call with "${abortReason}". No verdict here is evidence about the rubric. Check the ai_scoring caps and the kill switch, then run again.`,
  );
}

describe("eval harness", () => {
  /**
   * AC-1: the data quality gate, BEFORE a session is minted or a call is spent.
   *
   * IT IS A `beforeAll` FOR A MECHANICAL REASON, not a stylistic one. A `-t`
   * filter removes matching `it`s but never a `beforeAll`, so this check runs
   * on a one pair debugging run exactly as it does on the full set. Broken
   * committed data would otherwise be caught only by whoever happened to run
   * the whole thing.
   */
  beforeAll(async () => {
    try {
      const issues = validateGroundTruth(ARCHETYPES, PAIRS);

      if (issues.length > 0) {
        throw new Error(
          [
            `The committed ground truth set is invalid, so nothing was scored and no vendor call was made. ${issues.length} issue(s):`,
            ...issues.map(
              (issue) => `  ${issue.kind} [${issue.subject}]: ${issue.message}`,
            ),
          ].join("\n"),
        );
      }

      /**
       * AC-5's three pair ids, checked as hard as a duplicate id is.
       *
       * IT IS FATAL RATHER THAN A WARNING BECAUSE THE FAILURE IS SILENT. Every
       * consumer of these ids already degrades gracefully when one is missing,
       * correctly, since a `-t` filter can genuinely exclude a pair. That makes
       * a rename look exactly like a filter, so the leak check would simply
       * stop running and the run would still exit 0. Refusing here, before the
       * mint, is the only place the difference can still be told.
       */
      const missingPreferenceIds = validatePreferenceIds(PAIRS);

      if (missingPreferenceIds.length > 0) {
        throw new Error(
          `The committed ground truth set is invalid, so nothing was scored and no vendor call was made. AC-5's preference leak check names ${missingPreferenceIds.length} pair id(s) that no pair defines: ${missingPreferenceIds.join(", ")}. Either a pair was renamed in src/features/scoring/eval/pairs.ts, or one was removed. Update PREFERENCE_BASELINE_ID and PREFERENCE_CONFLICT_IDS in test/helpers/eval-verdict.ts to match, rather than deleting this check: without all three the leak check cannot run at all.`,
        );
      }

      const user = await mintFixtureUser("eval-harness");
      fixtureUserId = user.id;
      session = await mintSession(user.email);

      /** Last statement on purpose: only a whole setup counts as one. */
      setupFailure = undefined;
    } catch (error) {
      /**
       * RECORDED, THEN RETHROWN UNCHANGED. The rethrow is what makes the
       * runner fail the file; the record is what stops the `afterAll` writing
       * a report that claims the run completed. The mint can fail after the
       * user exists, which is why the cleanup in `afterAll` still runs.
       */
      setupFailure = error instanceof Error ? error.message : String(error);
      throw error;
    }
  });

  /**
   * AC-5, AC-7, AC-9, in that order, and THE ORDER IS LOAD BEARING. The report
   * is written before the fixture user is deleted, so a cleanup failure can
   * never destroy the output of a run that was just paid for. The cleanup is in
   * a `finally` so a report failure still cannot leave a user behind, and the
   * leak throw comes last so it can never pre-empt either.
   */
  afterAll(async () => {
    /**
     * Declared out here so the AC-7 leak throw can still read it after the
     * cleanup has run, which is the ordering the doc comment above describes.
     */
    let preferenceLeak: PreferenceLeakOutcome | undefined;

    /**
     * EVERYTHING IS INSIDE THE `try`, THE REPORT'S OWN ASSEMBLY INCLUDED.
     * `resolvedModel()` and `preferenceLeakCheck()` can both throw, and when
     * the assembly sat outside this block a throw there skipped the `finally`
     * and left the minted fixture user behind (found in review 2026-09-08).
     */
    try {
      const baselinePair = PAIRS.find(
        (pair) => pair.id === PREFERENCE_BASELINE_ID,
      );

      preferenceLeak =
        setupFailure !== undefined
          ? ({
              kind: "leak-check-skipped",
              detail: "The run never started, so no pair was scored.",
            } as const)
          : baselinePair === undefined
            ? ({
                kind: "leak-check-skipped",
                detail: `${PREFERENCE_BASELINE_ID} is not in the committed set.`,
              } as const)
            : preferenceLeakCheck(verdicts, baselinePair.expectedBand);

      const report: EvalReport = buildEvalReport({
        startedAt,
        finishedAt: new Date().toISOString(),
        filter: inject("evalTestNamePattern") ?? null,
        pairIds: PAIRS.map((pair) => pair.id),
        attempted,
        verdicts,
        /** AC-11: read off the resolved tier config, never a name typed here. */
        model: resolvedModel(TIERS.ai_scoring.model).modelId,
        bandAnchorsHash: bandAnchorsHash(BAND_ANCHORS),
        abortReason,
        setupFailure,
        preferenceLeak,
      });

      const path = await writeEvalReport(report);

      /**
       * `process.stdout.write`, NOT `console.log`, AND THE DIFFERENCE IS THE
       * WHOLE OF AC-1 ON A GOOD DAY. Vitest intercepts `console` and its
       * default reporter drops what a passing suite logged, so the table
       * printed on a failing run and silently vanished on a passing one, which
       * is the run a reader most wants to read. Verified both ways on
       * 2026-09-08 with a scratch file and no vendor call: `console.log` zero
       * occurrences in the output, `process.stdout.write` one.
       */
      process.stdout.write(
        `${formatReportTable(report)}\n  report: ${path}\n\n`,
      );
    } finally {
      if (fixtureUserId !== undefined) await deleteFixtureUser(fixtureUserId);
    }

    /**
     * AC-7: a suspected leak makes the run's exit code non zero on its own.
     *
     * IT IS THROWN RATHER THAN LEFT TO THE THREE PAIRS' OWN TESTS. Under
     * today's data those three would each fail anyway, because none declares
     * `acceptableBands` and so any band but `strong_match` fails them. That is
     * a property of the current committed set, not of this rule, and resting
     * the exit code on it would make AC-7 quietly wrong the day a pair gains a
     * widened tolerance.
     */
    if (preferenceLeak?.kind === "preference-leak-suspected") {
      throw new Error(
        `Preference leak suspected. ${describeDivergence(preferenceLeak.baselineBand, preferenceLeak.divergent)}`,
      );
    }
  });

  /**
   * AC-8: the test name carries the pair's id AND its tags, which is what lets
   * the runner's own `-t` filter select one pair (`-t control-direct-match`) or
   * a whole tag (`-t stability-probe`) with nothing custom built for it.
   * Filters can overlap, since `-t` is a substring match; spec 0017 accepts
   * that rather than designing around it.
   */
  for (const pair of PAIRS) {
    it.concurrent(`${pair.id} [${pair.tags.join(" ")}]`, async ({ expect }) => {
      attempted.add(pair.id);
      refuseIfAborted(pair.id);

      const archetype = ARCHETYPES.find(
        (candidate) => candidate.id === pair.archetypeId,
      );

      if (archetype === undefined) {
        throw new Error(
          `Pair "${pair.id}" names archetype "${pair.archetypeId}", which no archetype defines. validateGroundTruth() should have caught this before any call was spent.`,
        );
      }

      if (session === undefined) {
        throw new Error(
          "No session was minted, so nothing can be scored. The beforeAll must have failed.",
        );
      }

      const outcomes: RerunOutcome[] = [];

      /**
       * AC-2: ONE AFTER ANOTHER, NEVER FIRED TOGETHER. These five exist to
       * measure how far the same input moves between separate calls, so
       * issuing them concurrently would measure something else entirely.
       * Different pairs DO overlap with each other, bounded by the project's
       * own `maxConcurrency`.
       */
      for (let rerun = 0; rerun < RERUNS_PER_PAIR; rerun += 1) {
        refuseIfAborted(pair.id);

        const outcome = classifyRerun(
          await scoreListing(archetype.profile, pair.listing, session.jar),
        );

        /**
         * AC-3: the refusal is NOT pushed into `outcomes`. It must never
         * reach a denominator, and this pair gets no verdict at all.
         */
        if (outcome.kind === "refused") {
          abortReason ??= outcome.reason;
          refuseIfAborted(pair.id);
        }

        outcomes.push(outcome);
      }

      const verdict = pairVerdict({
        pairId: pair.id,
        expectedBand: pair.expectedBand,
        ...(pair.acceptableBands === undefined
          ? {}
          : { acceptableBands: pair.acceptableBands }),
        tags: pair.tags,
        outcomes,
      });

      verdicts.set(pair.id, verdict);

      /**
       * AC-7: `fail` and `inconclusive` both fail this test, so the command's
       * own exit code is non zero for either. The message carries AC-6's
       * summary, so the terminal shows the bands and the denominator without
       * anyone opening the report.
       */
      const causes = Object.entries(verdict.failureDetails)
        .map(([detail, count]) => ` Failed ${count}x with ${detail}.`)
        .join("");

      expect(
        verdict.status,
        `${pair.id}: ${verdict.summary}${verdict.inconclusiveReason === undefined ? "" : ` (${verdict.inconclusiveReason})`}. Expected ${pair.expectedBand}${pair.acceptableBands === undefined ? "" : ` (accepting ${pair.acceptableBands.join(", ")})`}.${causes}`,
      ).toBe("pass");
    });
  }
});

/** The leak message, kept out of the `afterAll` so the ordering stays readable. */
function describeDivergence(
  baselineBand: string,
  divergent: readonly { readonly pairId: string; readonly band: string }[],
): string {
  return `${PREFERENCE_BASELINE_ID} scored ${baselineBand}, but ${divergent
    .map((pair) => `${pair.pairId} scored ${pair.band}`)
    .join(
      " and ",
    )}. These postings state their skill and experience requirements in identical words, so only the preference text that differs between them can explain the gap.`;
}
