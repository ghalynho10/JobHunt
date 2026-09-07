import type { Listing } from "@/features/search/adzuna";

import type { GroundTruthPair } from "./ground-truth";

/**
 * The fixed profile and posting pairs, each with its band decided in advance
 * (spec 0016, AC-2 through AC-5).
 *
 * EVERY `expectedBand` BELOW WAS ARGUED FROM `BAND_ANCHORS`'S OWN WRITTEN TEXT
 * BEFORE ANY MODEL WAS ASKED, and the `rationale` field carries that argument.
 * That ordering is the whole reason this file exists: a band read off a model's
 * output would make the set a description of today's scorer rather than a
 * measurement of it, and every later run would agree with it by construction.
 *
 * NO PAIR ENCODES A RULE THE ANCHORS DO NOT STATE. In particular there is no
 * seniority ceiling here beyond the one `strong_match`'s own wording names. An
 * earlier draft of this set assumed the rubric caps a candidate's band by
 * seniority; it does not, and `boundary-seniority-gap` below carries a widened
 * `acceptableBands` precisely because that silence is real rather than being
 * filled in with an invented answer.
 *
 * EVERY POSTING IS FROZEN LITERAL TEXT, NEVER A LIVE ADZUNA FETCH (AC-6). A
 * fetched posting would change under the set without anyone editing it, which
 * would quietly turn a regression into a data change and back again.
 */

/**
 * One posting's load bearing fields, with the inert ones filled in.
 *
 * ONLY `title`, `companyName`, `location` AND `descriptionSnippet` REACH THE
 * MODEL. `buildScoringPrompt()` sends those four and nothing else, so the
 * remaining `Listing` fields are plumbing: they exist because the pair is typed
 * as a real `Listing` (AC-6, AC-7), not because scoring reads them. They are
 * set the same way `score.test.ts` already sets them for its fixture listing.
 *
 * THE SALARY FIELDS ARE ALWAYS UNDEFINED, AND THAT IS LOAD BEARING FOR AC-4.
 * The prompt never sends them, so a pay figure written into `salaryMin` would
 * be invisible to the model. The preference violation pair's pay conflict has
 * to live in `descriptionSnippet`'s own text or it does not exist at all.
 */
function posting(
  fields: Pick<
    Listing,
    "sourceJobId" | "title" | "companyName" | "location" | "descriptionSnippet"
  >,
): Listing {
  return {
    source: "adzuna",
    sourceJobId: fields.sourceJobId,
    title: fields.title,
    companyName: fields.companyName,
    location: fields.location,
    url: `https://www.adzuna.com/land/ad/${fields.sourceJobId}`,
    descriptionSnippet: fields.descriptionSnippet,
    salaryMin: undefined,
    salaryMax: undefined,
    salaryCurrency: undefined,
    salaryIsPredicted: false,
    postedAt: undefined,
  };
}

/** The full ground truth set (AC-2). */
export const PAIRS: readonly GroundTruthPair[] = [
  {
    id: "control-direct-match",
    archetypeId: "direct-fit-control",
    listing: posting({
      sourceJobId: "gt-001",
      title: "Backend Engineer",
      companyName: "Harrowgate Data",
      location: "Atlanta, GA",
      descriptionSnippet:
        "We are hiring a Backend Engineer to build and run the Python services behind our reporting platform. You will own ingestion pipelines (Airflow), design and evolve our PostgreSQL schemas, and maintain the REST APIs our web client reads. Everything ships in Docker on AWS. We are looking for two to four years of professional backend experience and someone comfortable owning a pipeline end to end. Based in Atlanta, or fully remote within the US.",
    }),
    expectedBand: "strong_match",
    tags: ["control"],
    rationale:
      "Python, AWS, PostgreSQL, Docker, Airflow, REST API design and data pipelines are all named in the visible posting and all sit in the archetype's own skills and work history, at the two to four years the posting asks for. That is strong_match's wording exactly: the skills and work history cover essentially everything the visible posting asks for, at the seniority asked for, with no stretch to argue.",
  },
];
