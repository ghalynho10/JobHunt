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
];
