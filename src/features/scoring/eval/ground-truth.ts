import type { Listing } from "@/features/search/adzuna";

import {
  ADZUNA_SNIPPET_CHARACTERS,
  BANDS,
  type Band,
  type ScoringProfile,
} from "../rubric";

/**
 * The ground truth set's own types and its invariant checker (spec 0016, AC-6,
 * AC-7, AC-8).
 *
 * NOTHING HERE RUNS ON A REQUEST PATH. This module and the two data modules
 * beside it are read only by feature 16's eval harness command and by the guard
 * test in this folder. There is no database table, no migration, and no session.
 *
 * THE TYPES POINT AT THE APPLICATION'S OWN, NEVER AT A COPY (AC-7). An
 * archetype's `profile` is exactly `ScoringProfile` and a pair's `listing` is
 * exactly `Listing`, so a malformed entry is a compile error against the shape
 * the scorer really sends, not a runtime surprise inside a harness run that has
 * already spent vendor calls getting there.
 */

/**
 * One invented candidate the harness scores postings against (AC-1).
 *
 * EVERY FIELD OF `profile` REACHES OPENAI ON EVERY HARNESS RUN, from a public
 * repository, which is why AC-1's "no real person, no real employer" rule is
 * load bearing here rather than the ordinary fixtures convention. `description`
 * is the one field that never travels: it exists so a later reader can see why
 * this archetype was invented without having to infer it from `summary`.
 */
export interface EvalArchetype {
  /** Unique, kebab case, e.g. `direct-fit-control`. */
  readonly id: string;
  /** Short human name, for a harness report's own output. */
  readonly label: string;
  /** Why this archetype exists. Never sent to the model. */
  readonly description: string;
  /** Exactly what `buildScoringPrompt()` takes, so nothing is adapted in between. */
  readonly profile: ScoringProfile;
}

/**
 * One archetype against one posting, with the band decided in advance (AC-2).
 *
 * `expectedBand` IS DECIDED FROM `BAND_ANCHORS`'S OWN WRITTEN TEXT, BEFORE ANY
 * MODEL RUN. That ordering is the whole point of the set: a band read off a
 * model's output would make this data a description of the scorer rather than a
 * measurement of it.
 */
export interface GroundTruthPair {
  /** Unique across the set. */
  readonly id: string;
  /** Names an `EvalArchetype.id`. Many pairs may share one archetype. */
  readonly archetypeId: string;
  /**
   * Exactly what `buildScoringPrompt()` takes. Only `title`, `companyName`,
   * `location` and `descriptionSnippet` are load bearing to scoring; the rest
   * are inert plumbing values, set the way `score.test.ts` already sets them.
   */
  readonly listing: Listing;
  /** The single best answer under today's anchor wording. */
  readonly expectedBand: Band;
  /**
   * Present ONLY where the anchor text genuinely cannot narrow to one band
   * (AC-3). Always contains `expectedBand` itself and always holds at least two
   * bands: a one element list would be an exact expectation wearing a disguise,
   * and would let a pair look tolerant while asserting the same single answer.
   * Absent means only `expectedBand` counts as a pass.
   */
  readonly acceptableBands?: readonly Band[];
  /** At minimum from `control`, `preference-isolation`, `boundary`, `stability-probe`. */
  readonly tags: readonly string[];
  /** Why this band, argued against `BAND_ANCHORS`'s wording, before any run. */
  readonly rationale: string;
}

/**
 * One broken invariant `validateGroundTruth()` found.
 *
 * `kind` IS A CLOSED UNION RATHER THAN FREE TEXT (AC-8), so a check cannot be
 * added under a string nothing ever matches on, and the guard test's per check
 * assertions cannot silently stop naming a real case.
 */
export interface GroundTruthIssue {
  readonly kind:
    | "duplicate-id"
    | "unknown-archetype-id"
    | "band-not-covered"
    | "snippet-too-long"
    | "invalid-acceptable-bands"
    | "missing-required-tag"
    | "stability-probe-not-truncated";
  /** The offending id, band, or tag. */
  readonly subject: string;
  /** Human readable detail, for the guard test's failure output and the harness. */
  readonly message: string;
}

/**
 * The tags at least one pair must carry (AC-8).
 *
 * BOTH EXIST TO STOP THE SET QUIETLY LOSING ITS TWO NON ACCURACY PAIRS. The
 * preference isolation pair is the only structural way feature 16 can catch a
 * stated preference moving a band, which spec 0015 could enforce by instruction
 * alone; the stability probe is the only pair that watches the input shape spec
 * 0015's Follow up already observed scoring inconsistently. An edit that deleted
 * either would otherwise leave a set that still looks complete.
 */
const REQUIRED_TAGS = ["preference-isolation", "stability-probe"] as const;

/** The tag whose pairs must reach `buildScoringPrompt()`'s cut off branch. */
const STABILITY_PROBE_TAG = "stability-probe";

/**
 * The ellipsis `buildScoringPrompt()` itself reads (`rubric.ts`), as one
 * character.
 *
 * U+2026, NEVER THREE ASCII PERIODS. The prompt builder's own check is
 * `descriptionSnippet.trimEnd().endsWith("…")`, so a snippet ending `...` lands
 * in the untruncated branch and is described to the model as a whole posting.
 * For a stability probe pair that is not a cosmetic difference: it would send
 * the model a different claim about the text than the observed instability was
 * ever measured under, and the pair would silently stop probing what it exists
 * to probe.
 */
const ELLIPSIS = "…";

/**
 * Every invariant TypeScript's structural typing cannot express (AC-8).
 *
 * PURE, AND IT NEVER THROWS. A broken invariant is a returned value, the way
 * every other failure in this project is a value, so the guard test can assert
 * on the exact set of issues rather than on a thrown message, and so feature
 * 16's harness can report all of them at once instead of stopping at the first.
 *
 * IT TAKES ITS INPUTS AS ARGUMENTS RATHER THAN IMPORTING `ARCHETYPES` AND
 * `PAIRS` ITSELF. That is what lets the guard test drive each check with a
 * deliberately malformed fixture and prove the check actually fires, instead of
 * proving only that today's real data happens to pass (a check that had silently
 * stopped checking would pass that weaker test every time).
 *
 * @param archetypes The archetype set, normally `ARCHETYPES`.
 * @param pairs The pair set, normally `PAIRS`.
 * @returns Every issue found. Empty means the set is valid.
 */
export function validateGroundTruth(
  archetypes: readonly EvalArchetype[],
  pairs: readonly GroundTruthPair[],
): readonly GroundTruthIssue[] {
  const issues: GroundTruthIssue[] = [];

  const archetypeIds = new Set<string>();
  for (const archetype of archetypes) {
    if (archetypeIds.has(archetype.id)) {
      issues.push({
        kind: "duplicate-id",
        subject: archetype.id,
        message: `More than one archetype uses the id "${archetype.id}".`,
      });
      continue;
    }
    archetypeIds.add(archetype.id);
  }

  const pairIds = new Set<string>();
  for (const pair of pairs) {
    if (pairIds.has(pair.id)) {
      issues.push({
        kind: "duplicate-id",
        subject: pair.id,
        message: `More than one pair uses the id "${pair.id}".`,
      });
    } else {
      pairIds.add(pair.id);
    }

    if (!archetypeIds.has(pair.archetypeId)) {
      issues.push({
        kind: "unknown-archetype-id",
        subject: pair.id,
        message: `Pair "${pair.id}" names archetype "${pair.archetypeId}", which no archetype defines.`,
      });
    }

    const snippet = pair.listing.descriptionSnippet;

    if (snippet !== undefined && snippet.length > ADZUNA_SNIPPET_CHARACTERS) {
      issues.push({
        kind: "snippet-too-long",
        subject: pair.id,
        message: `Pair "${pair.id}" has a ${snippet.length} character descriptionSnippet, above Adzuna's own ${ADZUNA_SNIPPET_CHARACTERS} character ceiling.`,
      });
    }

    /**
     * A present `acceptableBands` has to widen a real expectation, not restate
     * or contradict one. Omitting `expectedBand` would make the pair's own best
     * answer a failing answer; holding one band would be an exact expectation
     * written in a shape that reads as tolerant.
     */
    if (pair.acceptableBands !== undefined) {
      if (!pair.acceptableBands.includes(pair.expectedBand)) {
        issues.push({
          kind: "invalid-acceptable-bands",
          subject: pair.id,
          message: `Pair "${pair.id}" lists acceptableBands that omit its own expectedBand "${pair.expectedBand}".`,
        });
      }

      /**
       * DISTINCT BANDS, NOT ARRAY LENGTH. Counting entries let
       * `["good_match", "good_match"]` through: two elements, and it contains
       * its own `expectedBand`, so both checks passed while the pair named one
       * real band and was therefore an exact expectation wearing a tolerant
       * shape, the precise thing this check exists to refuse. Raised by a fresh
       * model review on 2026-09-07.
       */
      const distinctBands = new Set(pair.acceptableBands);

      if (distinctBands.size < 2) {
        issues.push({
          kind: "invalid-acceptable-bands",
          subject: pair.id,
          message: `Pair "${pair.id}" lists ${pair.acceptableBands.length} acceptableBands naming ${distinctBands.size} distinct band(s); a widened tolerance needs at least two different bands.`,
        });
      }
    }

    /**
     * The one check that reads the snippet's last character rather than its
     * length: see `ELLIPSIS` above for why three periods is a real failure and
     * not a typographic preference.
     */
    if (
      pair.tags.includes(STABILITY_PROBE_TAG) &&
      (snippet === undefined || !snippet.trimEnd().endsWith(ELLIPSIS))
    ) {
      issues.push({
        kind: "stability-probe-not-truncated",
        subject: pair.id,
        message: `Pair "${pair.id}" is tagged ${STABILITY_PROBE_TAG} but its descriptionSnippet does not end in the U+2026 ellipsis character, so buildScoringPrompt would treat it as a whole posting.`,
      });
    }
  }

  /**
   * Coverage is asked of the whole set at once, so it is checked after the per
   * pair pass rather than inside it. A band reached only through a widened
   * tolerance still counts as covered: `acceptableBands` is a real expectation
   * the harness can fail against, not a note.
   */
  const coveredBands = new Set<Band>();
  for (const pair of pairs) {
    coveredBands.add(pair.expectedBand);
    for (const band of pair.acceptableBands ?? []) coveredBands.add(band);
  }

  for (const band of BANDS) {
    if (!coveredBands.has(band)) {
      issues.push({
        kind: "band-not-covered",
        subject: band,
        message: `No pair expects or accepts the band "${band}", so a run can never exercise it.`,
      });
    }
  }

  const usedTags = new Set(pairs.flatMap((pair) => pair.tags));

  for (const tag of REQUIRED_TAGS) {
    if (!usedTags.has(tag)) {
      issues.push({
        kind: "missing-required-tag",
        subject: tag,
        message: `No pair is tagged "${tag}", so the set has lost the pair that tag exists to guarantee.`,
      });
    }
  }

  return issues;
}
