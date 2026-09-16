import type { ScoringProfile } from "@/features/scoring/rubric";

/**
 * The two example candidate profiles `/demo` offers (spec 0021, AC-5, AC-14).
 *
 * THEY ARE THE ONLY FABRICATED THING LEFT ON THIS PAGE, and that is what makes
 * the page honest. Before 2026-09-14 the listings and their scores were hand
 * written too; now every listing is a real Adzuna posting and every score is a
 * real scoring call, so these two candidates are the whole disclosure. AC-14
 * requires the page to show them in full for exactly that reason: a reader who
 * can see what was made up can judge everything that was not.
 *
 * EACH ONE IS `ScoringProfile` SHAPED, not a display record with a profile
 * bolted on. It is the exact shape `boundProfile()` produces for a real signed
 * in user, so the refresh hands it to `scoreListings()` unchanged and the demo
 * is scored by the same code path as a real search rather than by a parallel
 * one written to look like it.
 *
 * A CONSTANT LIST IN CODE RATHER THAN A DATABASE READ, deliberately. There are
 * only ever two, they are fixed by the spec, and `demo_result`'s own check
 * constraint already names the same two slugs. A second table to hold two rows
 * would add a read that can fail to a page whose read path already has two
 * queries to get right.
 *
 * The slugs must stay in step with `public.demo_result`'s `persona_slug` check
 * constraint (`supabase/migrations/20260913120000_demo_result.sql`). A slug
 * added here without a matching migration writes nothing at the refresh and
 * renders an empty profile; one added there without a matching entry here is
 * unreachable.
 *
 * EVERY EMPLOYER NAMED IN A WORK HISTORY BELOW IS OBVIOUSLY FICTIONAL. The
 * candidate is the disclosed fabrication, so the companies inside the
 * candidate's own history are fabricated in the same visible register, which
 * keeps them from being mistaken for the real employers on the listing cards.
 */

/** One example profile: the slug in the URL, how it reads, and who it is. */
export interface DemoPersona {
  readonly slug: string;
  readonly label: string;
  /** Passed to `scoreListings()` unchanged at every refresh. */
  readonly profile: ScoringProfile;
}

/**
 * The two profiles, in the order the switcher renders them.
 *
 * TWO ENGINEERS WITH CONTRASTING STACKS, CHANGED FROM AN ENGINEER AND A
 * DESIGNER ON 2026-09-14. Both are now scored for real against the same real
 * listings, and a designer scored against engineering postings would land at
 * the bottom of every band on every listing, which demonstrates nothing except
 * that a designer is not an engineer. Two engineers whose skills barely overlap
 * produce a genuine per candidate difference on the same posting, which is the
 * claim AC-6 and AC-16 exist to show.
 *
 * EACH ONE'S FIRST DESIRED TITLE IS ALSO ITS OWN ROLE'S SEARCH (revised
 * 2026-09-15). The refresh runs "backend engineer" and "frontend engineer",
 * `DEMO_SEARCHES` in `refresh.ts`, and both candidates score the listings from
 * both. Changing a candidate's first desired title here does not change the
 * query that runs; the two are kept in step by hand.
 *
 * The first is the default, which is stated once below rather than left as an
 * unwritten property of this array's order.
 */
export const DEMO_PERSONAS = [
  {
    slug: "backend-engineer",
    label: "Backend engineer",
    profile: {
      summary:
        "Backend engineer focused on distributed systems and infrastructure, most recently building and operating Kubernetes based platforms at scale.",
      skills: [
        "Go",
        "PostgreSQL",
        "Kubernetes",
        "Terraform",
        "gRPC",
        "Docker",
        "AWS",
        "CI/CD",
      ],
      experience: [
        {
          title: "Senior Backend Engineer",
          company: "Fictional Systems Co",
          startedOn: "2022-01-01",
          endedOn: undefined,
          description:
            "Built and operated a Kubernetes microservices platform in Go, backed by PostgreSQL, with Terraform managed infrastructure on AWS.",
        },
        {
          title: "Backend Engineer",
          company: "Faux Data Inc",
          startedOn: "2019-03-01",
          endedOn: "2021-12-31",
          description:
            "Designed gRPC APIs and CI/CD pipelines for a data ingestion platform.",
        },
      ],
      preferences: {
        desired_titles: ["Backend Engineer", "Platform Engineer"],
        desired_locations: ["Remote", "Chicago, IL"],
        remote_preference: "remote",
        minimum_pay: 150000,
        minimum_pay_currency: "USD",
      },
    },
  },
  {
    slug: "frontend-engineer",
    label: "Frontend engineer",
    profile: {
      summary:
        "Frontend engineer specializing in React applications and design systems, focused on accessibility and performance.",
      skills: [
        "TypeScript",
        "React",
        "CSS",
        "Next.js",
        "Accessibility",
        "Design systems",
        "Playwright",
        "Web Vitals",
      ],
      experience: [
        {
          title: "Senior Frontend Engineer",
          company: "Fictional Fintech Co",
          startedOn: "2021-06-01",
          endedOn: undefined,
          description:
            "Led the React component library and design system, with a focus on WCAG 2.2 AA accessibility.",
        },
        {
          title: "Frontend Engineer",
          company: "Faux Systems Inc",
          startedOn: "2018-08-01",
          endedOn: "2021-05-31",
          description:
            "Built customer facing React applications with Playwright end to end coverage, and tracked Web Vitals to guide performance work.",
        },
      ],
      preferences: {
        desired_titles: ["Frontend Engineer", "UI Engineer"],
        desired_locations: ["Remote", "Austin, TX"],
        remote_preference: "remote",
        minimum_pay: 140000,
        minimum_pay_currency: "USD",
      },
    },
  },
] as const satisfies readonly DemoPersona[];

/** A slug this page will actually render. Never a raw query value. */
export type DemoPersonaSlug = (typeof DEMO_PERSONAS)[number]["slug"];

/** AC-5: the profile shown when the URL does not name a valid one. */
export const DEFAULT_DEMO_PERSONA: DemoPersonaSlug = "backend-engineer";

/**
 * The `?persona=` value, resolved to a profile this page can render (AC-5).
 *
 * ANYTHING THAT IS NOT EXACTLY ONE OF THE TWO SLUGS BECOMES THE DEFAULT, and
 * never an error: absent, empty, unrecognised, or an array from a repeated
 * `?persona=a&persona=b`. A public page reachable by a link anybody can edit
 * should show the product rather than an error, and there is nothing here worth
 * protecting that a strict parse would protect.
 *
 * A REPEATED PARAMETER DEFAULTS RATHER THAN TAKING THE FIRST VALUE, which is
 * the opposite of what `/search` does with `?q=a&q=b`. That is a deliberate
 * difference, not an inconsistency: on `/search` the first value is a search
 * term the reader plainly meant, while here two values mean the URL does not
 * name one profile, and the spec's own AC-5 lists the repeated case alongside
 * the unrecognised one.
 *
 * @param value The raw search param, trusted for nothing.
 */
export function parseDemoPersona(
  value: string | string[] | undefined,
): DemoPersonaSlug {
  const match = DEMO_PERSONAS.find((persona) => persona.slug === value);

  return match === undefined ? DEFAULT_DEMO_PERSONA : match.slug;
}
