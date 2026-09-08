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

/**
 * The requirements half of the preference isolation postings (AC-4).
 *
 * NAMED ONCE AND SHARED BY ALL THREE PAIRS RATHER THAN TYPED OUT THREE TIMES.
 * The whole evidential value of these pairs rests on their skill and experience
 * requirements being identical: if the wording drifts by a word, a band that
 * moves between them has an innocent explanation and proves nothing about a
 * preference leaking. Three copies of a long string is exactly the shape that
 * drifts under a later edit, so there is one copy and the two conflicting
 * postings vary from it explicitly.
 */
const BASELINE_REQUIREMENTS =
  "Backend Engineer to build and run the Python services behind our reporting platform. You will own ingestion pipelines (Airflow), design and evolve our PostgreSQL schemas, and maintain the REST APIs our web client reads. Everything ships in Docker on AWS. Two to four years of professional backend experience.";

/** What `preference-match` and `preference-title-conflict` both append: every preference met. */
const MATCHING_CIRCUMSTANCES =
  " This role is fully remote and you may be based anywhere in the US. The salary range for this position is $130,000 to $150,000.";

/** What `preference-violation` appends instead: all three circumstance preferences contradicted. */
const CONFLICTING_CIRCUMSTANCES =
  " This role is on site in our Chicago office five days a week, with no remote option. The salary for this position is $95,000.";

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
      "General software engineering and Node scripting carry over a little, and the archetype is at the three to five years asked for. Distributed systems, Kafka, schema and topic design, service architecture and operational ownership are the bulk of the visible ask and sit entirely outside a frontend history with no backend service and no direct database work. Only a small part carries over, which is weak_match rather than not_a_match. The line between those two bands is not literal skill token overlap, which is zero here: not_a_match's own wording turns on the posting being \"a different kind of work\", and a frontend engineer against a backend role is the same kind of work at a different layer. That is exactly what separates this pair from control-unrelated-field, where a mechanical engineering posting states outright that no software development is involved and the archetype's work has nothing to do with it. This is why the band is stated exactly rather than widened with acceptableBands: the anchors do narrow it, the reading is just harder than most, and this spec reserves acceptableBands for where the anchor text genuinely cannot narrow (Key invariants). It is also the set's only exact weak_match pair, so widening it would leave that band reachable only through boundary-seniority-gap's own tolerance.",
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

  /**
   * The one pair the anchor text cannot settle on its own (AC-3).
   *
   * `BAND_ANCHORS` NAMES A SENIORITY EXPECTATION ONLY INSIDE `strong_match`.
   * It says nothing anywhere about how a severe experience shortfall should
   * weigh against a genuinely overlapping named skill, which is exactly the
   * question this pair asks. `weak_match` ("only a small part carries over")
   * and `not_a_match` ("do not carry over in any substantial way") are both
   * defensible readings of the same text, so the pair carries a real range
   * rather than asserting one invented answer. Spec 0016's Follow up hands the
   * gap to spec 0015 to close on purpose.
   */
  {
    id: "boundary-seniority-gap",
    archetypeId: "severe-experience-gap",
    listing: posting({
      sourceJobId: "gt-012",
      title: "Staff Backend Engineer",
      companyName: "Ellery Grid",
      location: "Remote",
      descriptionSnippet:
        "Staff Backend Engineer to set technical direction across our billing platform. Our stack is Python, Go and PostgreSQL. You will own the architecture of systems several teams depend on, lead multi quarter migrations, mentor senior engineers, and be the person accountable when a design decision proves wrong two years later. Eight or more years of professional experience, with deep systems ownership and a track record of technical leadership, is required for this role.",
    }),
    expectedBand: "not_a_match",
    acceptableBands: ["weak_match", "not_a_match"],
    tags: ["boundary"],
    rationale:
      "Python is genuinely named in the visible posting and is genuinely one of the archetype's skills, so the overlap is real rather than nominal. Everything else the posting asks for, architecture ownership, leading migrations, mentoring senior engineers, eight or more years, is absent from a history of eight months and no independent ownership. BAND_ANCHORS states no seniority rule outside strong_match, so it cannot say whether one real skill against that shortfall is weak_match's small part carrying over or not_a_match's no substantial carry over. Both readings are honest, so both are accepted and not_a_match is recorded as the better one. This is a gap in the anchors, handed to spec 0015 in spec 0016's Follow up, not a settled fact.",
  },

  /**
   * The preference isolation pair (AC-4).
   *
   * THE TWO POSTINGS BELOW STATE THEIR SKILL AND EXPERIENCE REQUIREMENTS IN
   * IDENTICAL WORDS, on purpose. Everything that could move a band under spec
   * 0015's own instruction is held constant; the only differences are the
   * location, the on site or remote language, and the pay figure, and each of
   * those three contradicts one of `direct-fit-control`'s three stated
   * preferences. Both pairs therefore carry the same `expectedBand`.
   *
   * A HARNESS RUN SCORING THEM DIFFERENTLY IS THE EVIDENCE, and it is the only
   * structural evidence available. Spec 0015 excludes preferences from the band
   * by written instruction alone; nothing in the schema enforces it, and
   * `rubric.ts` says so itself. This pair is what spec 0015's own Follow up
   * asked feature 15 for.
   *
   * THE PAY CONFLICT LIVES IN THE DESCRIPTION TEXT, NEVER IN `salaryMin`.
   * `buildScoringPrompt()` sends four listing fields and the salary fields are
   * not among them, so a figure written into `salaryMin` would be invisible to
   * the model and the pair would test nothing.
   */
  {
    id: "preference-match",
    archetypeId: "direct-fit-control",
    listing: posting({
      sourceJobId: "gt-013",
      title: "Backend Engineer",
      companyName: "Wrenfield Systems",
      location: "Remote",
      descriptionSnippet: BASELINE_REQUIREMENTS + MATCHING_CIRCUMSTANCES,
    }),
    expectedBand: "strong_match",
    tags: ["preference-isolation"],
    rationale:
      "The baseline half of the isolation pair. The skills and work history cover essentially everything the visible posting asks for at the stated seniority, which is strong_match. The posting also happens to agree with all three of the archetype's stated preferences: remote, based anywhere, and pay above its stated minimum of 120000 USD.",
  },
  {
    id: "preference-violation",
    archetypeId: "direct-fit-control",
    listing: posting({
      sourceJobId: "gt-014",
      title: "Backend Engineer",
      companyName: "Wrenfield Systems",
      location: "Chicago, IL",
      descriptionSnippet: BASELINE_REQUIREMENTS + CONFLICTING_CIRCUMSTANCES,
    }),
    expectedBand: "strong_match",
    tags: ["preference-isolation"],
    rationale:
      "Word for word the same skill and experience requirements as preference-match, so by the anchors alone this is the same strong_match. All three of the archetype's stated preferences are now contradicted at once: Chicago is not among its desired locations, five days on site contradicts its remote preference, and 95000 is below its stated 120000 minimum. Spec 0015's instruction says none of that may move the band. If a run scores this below preference-match, a preference moved it.",
  },

  /**
   * The stability probe (AC-5).
   *
   * THIS PAIR DOES NOT ASSERT A CONFIDENT BAND, AND THAT IS ITS POINT. Spec
   * 0015's Follow up recorded this exact input shape, a real Adzuna excerpt at
   * the length ceiling naming no concrete requirement, scoring strong_match
   * three times and possible_match six times inside a single render on
   * 2026-09-06. The pair exists so feature 16 can watch how far this shape
   * moves across repeated runs, not so a single run can be marked right.
   *
   * THE LENGTH MATTERS AS MUCH AS THE ELLIPSIS. Written near the 500 character
   * ceiling rather than as a short snippet with a decorative ellipsis stuck on,
   * so `buildScoringPrompt()`'s own claim to the model, "this is the first 500
   * characters of a longer description", is actually true of this fixture. A
   * short snippet ending in U+2026 would reach the same branch while making the
   * prompt say something false about the text beneath it.
   */
  {
    id: "stability-probe-generic",
    archetypeId: "direct-fit-control",
    listing: posting({
      sourceJobId: "gt-015",
      title: "Software Engineer",
      companyName: "Perrimore Group",
      location: "Remote",
      descriptionSnippet:
        "At Perrimore Group we believe the best products come from people who are trusted to do their best work. Over the last decade we have built a culture we are proud of: we move quickly, we care about the people we serve, and we look after each other through every stage of growth. We offer a generous benefits package, a real commitment to balance outside work, and colleagues who make a hard week lighter. If this sounds like the kind of place you have been looking for, join our growing team and…",
    }),
    expectedBand: "possible_match",
    acceptableBands: ["strong_match", "possible_match"],
    tags: ["stability-probe"],
    rationale:
      "There is no concrete skill, technology, or seniority requirement anywhere in the visible text, so no anchor can be applied to it honestly. The two accepted bands are not a reading of BAND_ANCHORS at all: they are the two bands this exact input shape was actually observed producing on 2026-09-06, recorded in spec 0015's Follow up. Feature 16 should treat this pair as a variance measurement across reruns rather than as an ordinary accuracy check, which spec 0016 leaves to feature 16's own spec to decide.",
  },

  /**
   * The third isolation pair, and the only one varying a single dimension
   * (AC-4).
   *
   * EVERYTHING EXCEPT THE TITLE MATCHES `preference-match`, including the pay,
   * the location and the remote language, so this pair holds constant even the
   * three preferences `preference-violation` contradicts. The posting's own
   * `title` is the only value that differs from the baseline anywhere.
   *
   * THE CONFLICT IS LITERAL, NOT SEMANTIC, AND THAT IS THE POINT. "Server Side
   * Engineer" plainly describes the same work as "Backend Engineer", and any
   * sensible reading puts it inside a candidate who wants Backend Engineer, AI
   * Engineer or Software Engineer roles. It is outside `desired_titles` only as
   * a string. So a band that drops here cannot mean the model judged the work
   * differently: it can only mean it matched the posting's title against the
   * candidate's list and let the miss count.
   *
   * TITLE IS ISOLATED ALONE FOR TWO REASONS, NEITHER OF THEM ABOUT WHICH FIELDS
   * THE PROMPT SENDS (spec 0016, AC-4). First, coverage: `preference-violation`
   * already varied location, remote and pay together, so those three had a case
   * that could catch them; title was conflicted nowhere in the set. Second,
   * semantic fusion: a title names the work itself, so a fit judgment about a
   * Backend Engineer posting and a stated desire for a Backend Engineer title
   * are one short step apart. Location, remote and pay describe circumstances
   * of employment and are orthogonal to capability, so reading one of them as a
   * fit signal is a longer step.
   *
   * NOT BECAUSE TITLE IS THE ONLY PREFERENCE WITH A COUNTERPART IN THE PROMPT.
   * An earlier version of this comment said that and it is false: the prompt
   * sends `Location:` against `- Desired locations:` with exactly the structure
   * of `Title:` against `- Desired titles:`, and `preference-violation` above
   * puts both halves of the location comparison in one prompt. Remote and pay
   * are the two with no structured counterpart. That rule would isolate
   * location too, which is not what this set does.
   */
  {
    id: "preference-title-conflict",
    archetypeId: "direct-fit-control",
    listing: posting({
      sourceJobId: "gt-016",
      title: "Server Side Engineer",
      companyName: "Wrenfield Systems",
      location: "Remote",
      descriptionSnippet: BASELINE_REQUIREMENTS + MATCHING_CIRCUMSTANCES,
    }),
    expectedBand: "strong_match",
    tags: ["preference-isolation"],
    rationale:
      "Byte identical requirements text to preference-match, and the location, remote language and pay all still agree with the archetype's stated preferences. The only difference anywhere in this posting is its title, Server Side Engineer, which is absent from desired_titles as a string while describing exactly the work those titles name. By the anchors alone this is the same strong_match as its baseline. If a run scores it lower, the model read desired_titles as a checklist to match the posting's title against, which spec 0015's instruction forbids, and no other reading of the posting changed to explain it.",
  },
];
