import type { EvalArchetype } from "./ground-truth";

/**
 * The invented candidate profiles the ground truth pairs are scored against
 * (spec 0016, AC-1).
 *
 * EVERY PERSON, EMPLOYER, AND SENTENCE HERE IS FICTIONAL. Not one line traces
 * back to a real person's history, and no organization named is real. This is
 * not the ordinary fixtures rule restated: every archetype's `summary`,
 * `skills`, and `experience` is sent to OpenAI on every harness run, from a
 * repository anyone can read, so a real detail written in here would leave the
 * project permanently.
 *
 * EVERY ARCHETYPE CLEARS SPEC 0015's AC-7 GATE (at least one skill or one work
 * history entry). All four carry both. An archetype clearing neither would be
 * refused before scoring and could never produce a usable pair.
 *
 * SKILL NAMES ARE WRITTEN AS A PERSON WOULD ENTER THEM, plainly and without
 * qualifiers. `normalizeFitScore()` matches the model's answer against these
 * exact names, case insensitively and otherwise exactly, so a skill entered as
 * "basic Kubernetes exposure" could never be matched back. The depth of any
 * skill belongs in `summary` and in the work history text, where the model can
 * actually read it, and that is where it is written below.
 *
 * ARCHETYPES ARE AUTHORED AND COMMITTED BEFORE ANY POSTING THAT PAIRS WITH
 * THEM. That ordering is a process invariant this file cannot enforce (spec
 * 0016, key invariants): writing a profile beside its own matching posting
 * risks tuning the profile to the posting, which would make a control pair's
 * match arranged rather than honest.
 */

/**
 * The four archetypes, each a plainly different career shape (AC-1).
 *
 * `direct-fit-control` IS THE CONTROL GROUP FOR THE WHOLE SET. It is the only
 * archetype carrying `preferences`, because it is the only one the preference
 * isolation pairs run against: those two pairs need a profile with stated
 * locations, a stated remote preference, and a stated minimum pay for a posting
 * to be able to contradict all three. The other three leave `preferences`
 * undefined, which is the profile feature's own real "not set yet" state (spec
 * 0010, AC-10) and not a placeholder.
 */
export const ARCHETYPES: readonly EvalArchetype[] = [
  {
    id: "direct-fit-control",
    label: "Backend and AI engineer, three years",
    description:
      "The control group. A genuine mid level backend engineer with real data pipeline and cloud work, whose fit against an ordinary backend posting should be uncontroversial. Every other archetype is a deliberate departure from this one along a single axis.",
    profile: {
      summary:
        "Backend engineer with three years building and running Python services on AWS. Most of my work has been data pipelines and the REST APIs that sit in front of them: batch ingestion on Airflow, Postgres schema design, and the containers all of it ships in. I have read and debugged our Kubernetes manifests but have never owned a cluster.",
      skills: [
        "Python",
        "AWS",
        "PostgreSQL",
        "Docker",
        "REST API design",
        "Data pipelines",
        "Airflow",
        "Kubernetes",
      ],
      experience: [
        {
          title: "Backend Engineer",
          company: "Lattice Cove Systems",
          startedOn: "2024-03-01",
          endedOn: undefined,
          description:
            "Own the ingestion pipelines behind the reporting product: Airflow DAGs pulling from partner APIs into Postgres, and the internal REST API the reporting front end reads. Took the pipeline from nightly batch to hourly without adding a second database.",
        },
        {
          title: "Junior Backend Engineer",
          company: "Briarstone Analytics",
          startedOn: "2022-08-01",
          endedOn: "2024-02-01",
          description:
            "Built and maintained Python services on AWS (ECS, S3, RDS), wrote the Dockerfiles they shipped in, and paired on the Postgres schema work. First real exposure to Kubernetes, reading manifests our platform team wrote.",
        },
      ],
      preferences: {
        desired_titles: [
          "Backend Engineer",
          "AI Engineer",
          "Software Engineer",
        ],
        desired_locations: ["Atlanta, GA", "Remote"],
        remote_preference: "remote",
        minimum_pay: 120000,
        minimum_pay_currency: "USD",
      },
    },
  },
  {
    id: "severe-experience-gap",
    label: "Very early career engineer, under a year",
    description:
      "Departs from the control on seniority alone. The named skills genuinely overlap a backend posting, but there is almost no ownership history behind any of them. This is the archetype the boundary pair runs against, because it isolates the one question the anchors never answer: how a severe experience shortfall should weigh against a real, named skill overlap.",
    profile: {
      summary:
        "Recent computer science graduate, eight months into my first engineering job. I write Python for internal tooling, read and write basic SQL against our reporting database, and have deployed a couple of small services onto EC2 and S3 with a lot of guidance. I have not owned a service or a schema on my own yet.",
      skills: ["Python", "Git", "AWS", "SQL"],
      experience: [
        {
          title: "Associate Software Engineer",
          company: "Cedarline Devices",
          startedOn: "2026-01-05",
          endedOn: undefined,
          description:
            "Write Python scripts that pull device telemetry into our reporting database and tidy it for the analytics team. Fixed bugs across the internal tools codebase. Deployed two small internal services to EC2 and S3, following runbooks a senior engineer wrote.",
        },
      ],
      preferences: undefined,
    },
  },
  {
    id: "right-level-wrong-domain",
    label: "Product analyst, four years",
    description:
      "Departs from the control on domain alone, at the same career stage. Because the seniority matches an ordinary mid level posting, a low band against a backend role here can only have come from skills and work history, never from level. That is what makes this archetype useful across four different bands.",
    profile: {
      summary:
        "Product analyst with four years turning retail and marketplace data into decisions. I live in SQL and Tableau, design and read out A/B tests, and work directly with product managers and designers on what to measure. I sketch in Figma and run user research sessions when the numbers stop explaining a behaviour.",
      skills: [
        "SQL",
        "Tableau",
        "A/B testing",
        "Product analytics",
        "Figma",
        "User research",
      ],
      experience: [
        {
          title: "Senior Product Analyst",
          company: "Hollowmere Retail",
          startedOn: "2024-06-01",
          endedOn: undefined,
          description:
            "Own analytics for the checkout and returns experience. Design the A/B tests, write the SQL behind them, and present the readouts to product and merchandising. Built the Tableau dashboards the weekly trading meeting now runs from.",
        },
        {
          title: "Product Analyst",
          company: "Fennimore Group",
          startedOn: "2022-05-01",
          endedOn: "2024-05-01",
          description:
            "Reporting and experiment analysis for a marketplace product. Wrote the SQL for most of the team's recurring reports, ran moderated user research sessions, and worked in Figma with designers on what a redesign would need to prove.",
        },
      ],
      preferences: undefined,
    },
  },
  {
    id: "adjacent-insufficient-depth",
    label: "Frontend engineer, three years",
    description:
      "Departs from the control on depth rather than on domain or level. This is a real software engineer at the control's own career stage, so a small part of any backend posting genuinely carries over, which is exactly the shape weak_match's own wording describes and the reason this archetype exists.",
    profile: {
      summary:
        "Frontend engineer, three years, building component libraries and product interfaces in React and TypeScript. I care a lot about accessibility and have led two audits to WCAG AA. I write Node scripts for build tooling, but I have never built or run a backend service and have not worked with a database directly.",
      skills: [
        "React",
        "TypeScript",
        "CSS",
        "Accessibility",
        "Component design",
        "Node.js",
        "Git",
      ],
      experience: [
        {
          title: "Frontend Engineer",
          company: "Millhaven Studio",
          startedOn: "2024-02-01",
          endedOn: undefined,
          description:
            "Own the shared component library the product teams build from: React and TypeScript, documented states, and the accessibility work that took it to WCAG AA. Write the Node scripts that build and publish it.",
        },
        {
          title: "Junior Frontend Engineer",
          company: "Aldergate Interactive",
          startedOn: "2023-01-09",
          endedOn: "2024-01-31",
          description:
            "Built marketing and product pages in React, converted designs into reusable components, and fixed the keyboard and screen reader defects our first accessibility audit found.",
        },
      ],
      preferences: undefined,
    },
  },
];
