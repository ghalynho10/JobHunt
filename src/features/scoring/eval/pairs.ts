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
  {
    id: "control-one-gap",
    archetypeId: "direct-fit-control",
    listing: posting({
      sourceJobId: "gt-002",
      title: "Backend Engineer, Platform",
      companyName: "Thornbury Cloud",
      location: "Remote",
      descriptionSnippet:
        "Backend Engineer wanted for our platform team. Day to day is Python services, PostgreSQL, and the data pipelines feeding our customer reporting. What sets this role apart is the infrastructure half: you will own our Kubernetes workloads directly, writing and tuning the manifests, setting resource limits, and being on call for the cluster. Real production Kubernetes ownership is required, not just exposure to it. Two to five years of backend experience.",
    }),
    expectedBand: "good_match",
    tags: ["control"],
    rationale:
      "Python, PostgreSQL and data pipelines are all directly covered, which is the core of the work. The posting then names production Kubernetes ownership as a requirement, and the archetype's own history says plainly it has read manifests and never owned a cluster. That is good_match's wording: most of the visible posting is covered, one area is a genuine stretch, and the core of the work is clearly within reach.",
  },
  {
    id: "control-unrelated-field",
    archetypeId: "direct-fit-control",
    listing: posting({
      sourceJobId: "gt-003",
      title: "Mechanical Engineer, Thermal Systems",
      companyName: "Vesper Mechanical",
      location: "Marietta, GA",
      descriptionSnippet:
        "We are looking for a Mechanical Engineer to join our thermal systems group. You will design heat exchanger assemblies in SolidWorks, run thermal and stress simulations, produce manufacturing drawings to GD&T standards, and work with our machine shop through prototype and qualification builds. Requires a mechanical engineering degree and three or more years in thermal or fluid systems design. No software development is involved in this role.",
    }),
    expectedBand: "not_a_match",
    tags: ["control"],
    rationale:
      "Nothing in the archetype's skills or work history carries over: no CAD, no simulation, no mechanical design, and the posting says outright that no software development is involved. That is not_a_match's wording exactly, a different kind of work rather than a shortfall within the same kind.",
  },
  {
    id: "control-right-level",
    archetypeId: "severe-experience-gap",
    listing: posting({
      sourceJobId: "gt-004",
      title: "Junior Python Developer",
      companyName: "Quillon Software",
      location: "Remote",
      descriptionSnippet:
        "Junior Python Developer for our internal tools team. You will write and maintain Python scripts and small services, query our reporting database in SQL, and work in Git alongside two senior engineers who will review everything you ship. Zero to one years of professional experience. Some exposure to AWS is welcome but not required, and you will not be expected to own a service on your own in your first year.",
    }),
    expectedBand: "strong_match",
    tags: ["control"],
    rationale:
      "Python, SQL, Git and some AWS exposure are the whole visible ask, and all four are the archetype's real skills. The posting states zero to one years and explicitly does not expect independent ownership, which is the archetype's actual level. Everything the visible posting asks for is covered at the seniority asked for, which is strong_match.",
  },
  {
    id: "mild-stretch-possible-match",
    archetypeId: "severe-experience-gap",
    listing: posting({
      sourceJobId: "gt-005",
      title: "Backend Developer",
      companyName: "Marbrook Logistics",
      location: "Remote",
      descriptionSnippet:
        "Backend Developer to join our shipments team. You will build and maintain Python services on AWS, write the SQL behind them, and take features from design through to production yourself. We expect two to four years of professional experience and someone who has independently owned at least one service in production, including its on call rotation and its schema changes.",
    }),
    expectedBand: "possible_match",
    tags: ["control"],
    rationale:
      "Python, AWS and SQL are real overlaps with the visible posting, so a real part of the ask is covered. Independent production ownership across two to four years is a real part that is unproven: the archetype has eight months and has owned nothing alone. Applying would mean arguing the scripting and guided deployments transfer to owning a service, rather than pointing at having done it, which is possible_match's own wording. Unlike boundary-seniority-gap, the anchor text settles this on its own, so this pair carries no acceptableBands.",
  },
  {
    id: "control-domain-match",
    archetypeId: "right-level-wrong-domain",
    listing: posting({
      sourceJobId: "gt-006",
      title: "Senior Data Analyst",
      companyName: "Ashcombe Retail Group",
      location: "Atlanta, GA",
      descriptionSnippet:
        "Senior Data Analyst for our trading and merchandising teams. You will write the SQL behind our recurring reporting, build and maintain Tableau dashboards, design and read out A/B tests, and present findings directly to product and merchandising stakeholders. Three to five years in a product or commercial analytics role. Comfort working with designers and product managers on what to measure is important to us.",
    }),
    expectedBand: "strong_match",
    tags: ["control"],
    rationale:
      "SQL, Tableau, A/B testing, product analytics and stakeholder readouts are every named ask in the visible posting, and every one of them is the archetype's own daily work at exactly the three to five years stated. No stretch to argue, which is strong_match.",
  },
  {
    id: "key-domain-mismatch",
    archetypeId: "right-level-wrong-domain",
    listing: posting({
      sourceJobId: "gt-007",
      title: "Backend / AI Engineer",
      companyName: "Penfold Intelligence",
      location: "Remote",
      descriptionSnippet:
        "Backend or AI Engineer to build the services behind our model platform. You will write Python across distributed services, own the ML training and inference pipelines end to end, work with message queues and container orchestration, and be responsible for the latency and reliability of everything you ship. Three to five years of professional software engineering experience required.",
    }),
    expectedBand: "not_a_match",
    tags: ["control"],
    rationale:
      "The archetype is at the three to five years this posting asks for, so nothing here can be explained by seniority. Python, distributed services, ML pipelines, queues and orchestration are the entire visible ask and not one of them appears in the archetype's skills or work history. Analytics SQL and Tableau do not carry over to building services in any substantial way, which is not_a_match's own wording.",
  },
  {
    id: "good-match-adjacent",
    archetypeId: "right-level-wrong-domain",
    listing: posting({
      sourceJobId: "gt-008",
      title: "Senior Data Analyst, Commercial",
      companyName: "Redmoor Commerce",
      location: "Remote",
      descriptionSnippet:
        "Senior Data Analyst for our commercial team. You will own the SQL behind our reporting, design and read out experiments, and partner with product managers on what to measure. Three to five years in analytics. Two requirements are firm: all of our dashboarding is in Looker, so hands on Looker and LookML experience is expected, and we ask for a current SQL certification from one of the major cloud providers.",
    }),
    expectedBand: "good_match",
    tags: ["control"],
    rationale:
      "SQL, experiment design, stakeholder partnership and the three to five years are all directly covered, which is the core of the work. Looker and LookML are a named tool the archetype has not used, and the certification is a named credential it does not hold. That is one or two areas unproven with the core clearly within reach, which is good_match. It also touches a real silence in BAND_ANCHORS about credentials, recorded in spec 0016's Follow up.",
  },
  {
    id: "possible-adjacent-domain",
    archetypeId: "right-level-wrong-domain",
    listing: posting({
      sourceJobId: "gt-009",
      title: "Data Engineer",
      companyName: "Stanbridge Freight",
      location: "Remote",
      descriptionSnippet:
        "Data Engineer to maintain and extend the pipelines behind our freight reporting. You will write and tune the SQL our warehouse runs on, keep the scheduled ingestion jobs healthy, and take on some of the analytics reporting the business asks for. Three to five years of experience working with data. Experience keeping production pipelines running is what matters most to us here.",
    }),
    expectedBand: "possible_match",
    tags: ["control"],
    rationale:
      "SQL and analytics reporting are real, directly named overlaps, and the three to five years matches. Maintaining production ingestion pipelines is the part the posting says matters most, and it is unproven: the archetype has consumed a warehouse, never kept one running. Applying would mean arguing the analytics work transfers to pipeline engineering rather than pointing at it, which is possible_match.",
  },
  {
    id: "weak-match-shallow-overlap",
    archetypeId: "adjacent-insufficient-depth",
    listing: posting({
      sourceJobId: "gt-010",
      title: "Backend Engineer, Distributed Systems",
      companyName: "Calloway Streams",
      location: "Remote",
      descriptionSnippet:
        "Backend Engineer for our streaming platform. You will design and operate distributed services at scale, work in Kafka every day, own schema and topic design, and make the tradeoffs that keep a high throughput system available under load. Three to five years building backend services in production. Strong grounding in service architecture, data modelling, and operational ownership is required.",
    }),
    expectedBand: "weak_match",
    tags: ["control"],
    rationale:
      "General software engineering and Node scripting carry over a little, and the archetype is at the three to five years asked for. Distributed systems, Kafka, schema and topic design, service architecture and operational ownership are the bulk of the visible ask and sit entirely outside a frontend history with no backend service and no direct database work. Only a small part carries over, which is weak_match rather than not_a_match.",
  },
  {
    id: "control-frontend-match",
    archetypeId: "adjacent-insufficient-depth",
    listing: posting({
      sourceJobId: "gt-011",
      title: "Frontend Engineer",
      companyName: "Oakhaven Interfaces",
      location: "Remote",
      descriptionSnippet:
        "Frontend Engineer to work on our design system and product surfaces. You will build and document components in React and TypeScript, write the CSS behind them, and hold the bar on accessibility, including taking one product area through a WCAG AA audit this year. Two to four years of frontend experience. Comfort with Node based build tooling is useful day to day.",
    }),
    expectedBand: "strong_match",
    tags: ["control"],
    rationale:
      "React, TypeScript, CSS, component design, accessibility to WCAG AA and Node build tooling are every named ask in the visible posting, and all six are the archetype's own work at the two to four years stated. Nothing here is a stretch, which is strong_match.",
  },
];
