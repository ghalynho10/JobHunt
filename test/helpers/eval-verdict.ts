import type { GroundTruthPair } from "@/features/scoring/eval/ground-truth";
import { BANDS, type Band } from "@/features/scoring/rubric";
import type { ScoreOutcome } from "@/features/scoring/score";
import { isFailure } from "@/lib/result";
import type { UsageGateReason } from "@/lib/usage-gating/gate";

/**
 * The eval harness's verdict rules, as pure functions (spec 0017, AC-3, AC-4,
 * AC-5, AC-6).
 *
 * NOTHING HERE CALLS A VENDOR, MINTS A SESSION, OR READS A CLOCK. Every rule
 * this feature has to get right is decided in this file from values handed in,
 * which is what lets `eval-verdict.test.ts` prove each one against constructed
 * outcomes under the free unit suite. The harness in `test/eval/` owns the
 * expensive half: making the real calls and feeding their outcomes to these
 * functions.
 *
 * IT LIVES UNDER `test/`, NOT BESIDE FEATURE 15'S DATA IN `src/`. Root
 * `AGENTS.md` forbids an application module from importing a test helper, and
 * the harness needs the fixture session mint, which is a test helper. Spec 0017
 * settles that this whole feature sits on the test side of that line.
 *
 * NOTHING HERE NAMES A VENDOR OR A MODEL ID (AC-11).
 */

/** Three outcomes are possible per rerun, and each means something different. */
export type RerunOutcome =
  /** The gate allowed the call and the vendor returned a parsed band. */
  | { readonly kind: "scored"; readonly band: Band }
  /**
   * The usage gate refused (spec 0011). NEVER counted toward any denominator
   * (AC-3): a budget or kill switch stop is an operator condition, not evidence
   * about the rubric. The harness aborts the whole run on the first one.
   */
  | { readonly kind: "refused"; readonly reason: UsageGateReason }
  /** A vendor timeout or a malformed response. Counts against this pair only. */
  | { readonly kind: "failed"; readonly detail: string };

/**
 * Sorts one real `scoreListing()` result into the three cases above (AC-3).
 *
 * THE THREE ARE READ OFF THE SHAPE, NOT GUESSED. `scoreListing()` returns a
 * `Result` whose success half carries `allowed`, so a refusal is structurally
 * distinct from a failure (spec 0015's own key invariant). This function is the
 * one place that distinction is turned into the harness's own vocabulary, so no
 * later step has to re-derive it and get it subtly different.
 *
 * @param outcome Exactly what `scoreListing()` returned for one rerun.
 */
export function classifyRerun(outcome: ScoreOutcome): RerunOutcome {
  if (isFailure(outcome)) {
    return { kind: "failed", detail: `${outcome.kind}: ${outcome.message}` };
  }

  if (!outcome.value.allowed) {
    return { kind: "refused", reason: outcome.value.reason };
  }

  return { kind: "scored", band: outcome.value.value.band };
}

/**
 * The floor below which a pair has no trustworthy answer (AC-3).
 *
 * Three of five. Spec 0017's own tradeoff note is worth keeping in view: this
 * deliberately reports an unlucky run (three vendor failures, two real matching
 * answers) exactly like a run with no useful data at all, rather than inventing
 * a softer third tier of evidence.
 */
export const MINIMUM_SUCCESSES = 3;

/** The tag whose pairs are judged by AC-4's rule instead of AC-3's majority. */
export const STABILITY_PROBE_TAG = "stability-probe";

/** The baseline of the three way preference comparison (AC-5). */
export const PREFERENCE_BASELINE_ID = "preference-match";

/** The two pairs compared against that baseline (AC-5). */
export const PREFERENCE_CONFLICT_IDS = [
  "preference-violation",
  "preference-title-conflict",
] as const;

/**
 * Checks that the three ids above still name real pairs (AC-5).
 *
 * WITHOUT THIS, RENAMING A PAIR TURNS AC-5 OFF AND NOTHING SAYS SO. The three
 * constants above are plain strings with no tie to `pairs.ts`. The harness
 * looks its baseline up with `PAIRS.find(...)`, and every consumer of that
 * lookup already handles a miss gracefully: a missing baseline reports
 * `leak-check-skipped` and a missing conflict pair is simply not compared. Each
 * of those fallbacks is correct on its own, since a `-t` filter really can
 * exclude one of these pairs, and that is exactly what makes the failure
 * invisible: a renamed pair is indistinguishable from a filtered one, so the
 * whole preference leak check goes dark and the run still exits 0. Found in
 * review on 2026-09-08.
 *
 * IT LIVES HERE RATHER THAN IN `validateGroundTruth()`. That function is
 * application code under `src/`, and root `AGENTS.md` forbids an application
 * module importing anything under `test/`, which is where these three ids live
 * and belong: they are the harness's own reading of the set, not a property of
 * the set itself. Keeping the check beside the constants also means a later
 * edit to them sees its guard in the same file.
 *
 * Pure, and returns rather than throws, matching `validateGroundTruth()`'s own
 * shape. The caller decides what a broken tie is worth; the harness treats it
 * as fatal before a single call is spent.
 *
 * @param pairs The committed ground truth set to check the ids against.
 * @returns Every id above that names no pair, in the order listed. Empty means
 *   the tie holds.
 */
export function validatePreferenceIds(
  pairs: readonly GroundTruthPair[],
): readonly string[] {
  const pairIds = new Set(pairs.map((pair) => pair.id));

  return [PREFERENCE_BASELINE_ID, ...PREFERENCE_CONFLICT_IDS].filter(
    (id) => !pairIds.has(id),
  );
}

export type VerdictStatus = "pass" | "fail" | "inconclusive";

/** Why a pair has no usable verdict. Closed, so a report cannot invent a third. */
export type InconclusiveReason = "insufficient-successes" | "no-majority";

export interface PairVerdict {
  readonly pairId: string;
  readonly status: VerdictStatus;
  readonly inconclusiveReason?: InconclusiveReason;
  /**
   * The band a strict majority landed on. ABSENT ON PURPOSE where the verdict
   * is distribution shaped: a `stability-probe` pair (AC-4) and a passing no
   * majority spread (AC-3) both have no single winning band, and reporting one
   * anyway would be the harness inventing an answer its own rule refused to
   * pick.
   */
  readonly band?: Band;
  /** Every band a successful rerun returned, with how many times. */
  readonly distribution: Readonly<Partial<Record<Band, number>>>;
  readonly successes: number;
  /**
   * Successes plus vendor failures. REFUSALS ARE EXCLUDED (AC-3), which is why
   * this is not simply the rerun count.
   */
  readonly denominator: number;
  readonly failures: number;
  readonly refusals: number;
  /**
   * Every distinct vendor failure this pair hit, with how many times.
   *
   * WITHOUT THIS THE REPORT NAMES A NUMBER AND NOTHING ELSE. The first real run
   * of this harness (2026-09-08) came back "0 of 5 succeeded" with no way to
   * tell a vendor timeout from a misconfigured gate from a bad key, which is
   * exactly the silent failure this project's own rules forbid. Deduplicated
   * with counts, so five identical timeouts read as one cause seen five times
   * rather than five separate mysteries.
   */
  readonly failureDetails: Readonly<Record<string, number>>;
  /** AC-6: the printable line. Never a band on its own, always its denominator. */
  readonly summary: string;
}

export interface VerdictInput {
  readonly pairId: string;
  readonly expectedBand: Band;
  readonly acceptableBands?: readonly Band[];
  readonly tags: readonly string[];
  readonly outcomes: readonly RerunOutcome[];
}

/**
 * Counts the bands in `BANDS`'s own declared order.
 *
 * DECLARED ORDER, NOT FIRST SEEN ORDER, so the same five outcomes always print
 * and serialise identically whatever sequence the vendor answered in. A report
 * a human diffs against last week's is worthless if the ordering moves on its
 * own.
 */
function countBands(
  scored: readonly { readonly band: Band }[],
): Readonly<Partial<Record<Band, number>>> {
  const counts: Partial<Record<Band, number>> = {};

  for (const band of BANDS) {
    const count = scored.filter((outcome) => outcome.band === band).length;
    if (count > 0) counts[band] = count;
  }

  return counts;
}

/**
 * AC-6's one line, built here so no caller can print a band without its
 * denominator. A verdict object and its printable form are produced together,
 * which is what makes "never just a band on its own" true by construction
 * rather than by every call site remembering.
 */
function buildSummary(
  distribution: Readonly<Partial<Record<Band, number>>>,
  band: Band | undefined,
  successes: number,
  denominator: number,
  refusals: number,
): string {
  const entries = BANDS.flatMap((candidate) => {
    const count = distribution[candidate];
    return count === undefined ? [] : [`${count} ${candidate}`];
  });

  const observed =
    band !== undefined
      ? band
      : entries.length === 0
        ? "no scored band"
        : entries.join(" / ");

  const refusalNote = refusals === 0 ? "" : `, ${refusals} refused`;

  return `${observed}, ${successes} of ${denominator} succeeded${refusalNote}`;
}

/**
 * Decides one pair's verdict from its own reruns (AC-3, AC-4, AC-6).
 *
 * THE ORDER OF THE RULES IS LOAD BEARING. The 3 of 5 success floor is checked
 * FIRST, for every pair including a `stability-probe` one: AC-4 judges that tag
 * differently only "once AC-3's own 3 of 5 successes floor is met". A probe
 * that failed four times out of five is a broken run, not a stable one, and
 * checking its rule first would report it as a clean pass.
 *
 * AN ABSENT `acceptableBands` MEANS ONLY `expectedBand` PASSES. That is feature
 * 15's own documented meaning of the field (`ground-truth.ts`), not a reading
 * invented here, and it is what makes AC-4's rule well defined for a probe pair
 * that never declared a widened set.
 *
 * @param input The pair's own expectations, its tags, and this run's outcomes.
 */
export function pairVerdict(input: VerdictInput): PairVerdict {
  const scored = input.outcomes.filter(
    (outcome): outcome is Extract<RerunOutcome, { kind: "scored" }> =>
      outcome.kind === "scored",
  );
  const failures = input.outcomes.filter(
    (outcome) => outcome.kind === "failed",
  ).length;
  const refusals = input.outcomes.filter(
    (outcome) => outcome.kind === "refused",
  ).length;

  const successes = scored.length;
  const denominator = successes + failures;
  const distribution = countBands(scored);
  const accepted = input.acceptableBands ?? [input.expectedBand];

  const failureDetails: Record<string, number> = {};

  for (const outcome of input.outcomes) {
    if (outcome.kind !== "failed") continue;
    failureDetails[outcome.detail] = (failureDetails[outcome.detail] ?? 0) + 1;
  }

  const verdict = (
    status: VerdictStatus,
    band?: Band,
    inconclusiveReason?: InconclusiveReason,
  ): PairVerdict => ({
    pairId: input.pairId,
    status,
    ...(inconclusiveReason === undefined ? {} : { inconclusiveReason }),
    ...(band === undefined ? {} : { band }),
    distribution,
    successes,
    denominator,
    failures,
    refusals,
    failureDetails,
    summary: buildSummary(distribution, band, successes, denominator, refusals),
  });

  if (successes < MINIMUM_SUCCESSES) {
    return verdict("inconclusive", undefined, "insufficient-successes");
  }

  /**
   * AC-4. `expectedBand` is not consulted and no majority is computed: ONE
   * success outside the accepted set fails the pair even if every other success
   * matched, because this pair exists to show that no single run should be
   * trusted as the answer.
   */
  if (input.tags.includes(STABILITY_PROBE_TAG)) {
    const everyInside = scored.every((outcome) =>
      accepted.includes(outcome.band),
    );
    return verdict(everyInside ? "pass" : "fail");
  }

  /**
   * A STRICT majority, more than half, never "the most common band". Two of
   * four is the largest count in a 2 and 2 split and means the reruns
   * disagreed, which AC-3 handles below rather than calling a winner.
   */
  const majorityBand = BANDS.find((band) => {
    const count = distribution[band] ?? 0;
    return count > successes / 2;
  });

  if (majorityBand !== undefined) {
    return verdict(
      accepted.includes(majorityBand) ? "pass" : "fail",
      majorityBand,
    );
  }

  /**
   * AC-3's exception. A pair that declared a widened tolerance and whose every
   * successful rerun landed inside it has met the expectation it actually
   * stated, so a 2 and 2 split across two accepted bands is a pass reporting
   * its spread, not a false `inconclusive`. This is what makes
   * `boundary-seniority-gap`'s honest, anchor stated ambiguity survivable.
   *
   * `input.acceptableBands`, NOT `accepted`. AC-3 makes this exception
   * conditional on the field being PRESENT; falling back to `[expectedBand]`
   * here would be incoherent anyway, since a single band can never produce a no
   * majority split.
   *
   * BOUND TO A LOCAL SO THE PRESENCE CHECK IS ENFORCED BY THE COMPILER. Written
   * as `input.acceptableBands?.includes(...)` inside the `every`, the optional
   * chaining quietly did the presence check by itself and the explicit guard
   * beside it stopped being able to change any behaviour: deleting the guard
   * changed nothing and no test could tell (verified 2026-09-08, all 25 passed
   * with it removed). Against the local, deleting it is a type error instead,
   * which no amount of test coverage has to notice.
   */
  const widened = input.acceptableBands;

  if (
    widened !== undefined &&
    scored.every((outcome) => widened.includes(outcome.band))
  ) {
    return verdict("pass");
  }

  return verdict("inconclusive", undefined, "no-majority");
}

/**
 * What the three way preference comparison found (AC-5).
 *
 * `baseline-drift` AND `preference-leak-suspected` ARE DELIBERATELY DIFFERENT
 * FINDINGS. Both look like "the band moved", and they have opposite causes: one
 * says the rubric or model shifted for every pairing equally, the other says
 * something in the preference text alone moved a band it must never move. A
 * single "mismatch" verdict would hide exactly the distinction this trio of
 * pairs was built to expose.
 */
export type PreferenceLeakOutcome =
  /** One of the three did not run, or has no single band to compare. */
  | { readonly kind: "leak-check-skipped"; readonly detail: string }
  /** All three agree, on the expected band. Each pair's own verdict stands. */
  | { readonly kind: "consistent"; readonly band: Band }
  /** All three agree, on something else. Not a leak: nothing distinguished them. */
  | {
      readonly kind: "baseline-drift";
      readonly band: Band;
      readonly expectedBand: Band;
    }
  /** The baseline diverged from a conflict pair, and only preference text differs. */
  | {
      readonly kind: "preference-leak-suspected";
      readonly baselineBand: Band;
      readonly divergent: readonly {
        readonly pairId: string;
        readonly band: Band;
      }[];
    };

/**
 * Compares the preference baseline against its two conflict pairs (AC-5).
 *
 * WHY A DIVERGENCE HERE CAN ONLY BE THE PREFERENCES. All three postings state
 * their skill and experience requirements in identical words (feature 15 built
 * them that way on purpose); what differs is the location, the on site language
 * and the pay in one, and the job title alone in the other. Spec 0015's own
 * instruction says none of that may move the band, so a band that moves anyway
 * has exactly one available explanation.
 *
 * IT RUNS ONLY WHEN ALL THREE HAVE A COMPARABLE VERDICT. A pair excluded by a
 * `-t` filter, or one that came back `inconclusive`, leaves nothing honest to
 * compare, and the report says the check was skipped rather than quietly
 * omitting it.
 *
 * @param verdicts Every verdict this run produced, keyed by pair id.
 * @param expectedBand The baseline pair's own `expectedBand`, read from feature
 * 15's data rather than typed here, so a change there cannot leave this stale.
 */
export function preferenceLeakCheck(
  verdicts: ReadonlyMap<string, PairVerdict>,
  expectedBand: Band,
): PreferenceLeakOutcome {
  const baseline = verdicts.get(PREFERENCE_BASELINE_ID);

  if (baseline === undefined) {
    return {
      kind: "leak-check-skipped",
      detail: `${PREFERENCE_BASELINE_ID} did not run.`,
    };
  }

  if (baseline.band === undefined) {
    return {
      kind: "leak-check-skipped",
      detail: `${PREFERENCE_BASELINE_ID} has no single verdict band (${baseline.status}${baseline.inconclusiveReason === undefined ? "" : `, ${baseline.inconclusiveReason}`}): ${baseline.summary}.`,
    };
  }

  const conflicts: { readonly pairId: string; readonly band: Band }[] = [];

  for (const pairId of PREFERENCE_CONFLICT_IDS) {
    const conflict = verdicts.get(pairId);

    if (conflict === undefined) {
      return { kind: "leak-check-skipped", detail: `${pairId} did not run.` };
    }

    if (conflict.band === undefined) {
      return {
        kind: "leak-check-skipped",
        detail: `${pairId} has no single verdict band (${conflict.status}${conflict.inconclusiveReason === undefined ? "" : `, ${conflict.inconclusiveReason}`}): ${conflict.summary}.`,
      };
    }

    conflicts.push({ pairId, band: conflict.band });
  }

  const divergent = conflicts.filter(
    (conflict) => conflict.band !== baseline.band,
  );

  if (divergent.length > 0) {
    return {
      kind: "preference-leak-suspected",
      baselineBand: baseline.band,
      divergent,
    };
  }

  if (baseline.band !== expectedBand) {
    return { kind: "baseline-drift", band: baseline.band, expectedBand };
  }

  return { kind: "consistent", band: baseline.band };
}
