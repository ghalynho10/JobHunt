/**
 * The two example candidate profiles `/demo` offers (spec 0021, AC-5).
 *
 * A CONSTANT LIST IN CODE RATHER THAN A DATABASE READ, deliberately. There are
 * only ever two, they are fixed by the spec, and the seed migration's own check
 * constraint already names the same two slugs. A second table to hold two rows
 * would add a read that can fail to a page whose whole point is that it cannot
 * cost anything or break.
 *
 * The slugs must stay in step with `public.demo_result`'s `persona_slug` check
 * constraint (`supabase/migrations/20260913120000_demo_result.sql`). A slug
 * added here without a matching migration renders an empty profile; one added
 * there without a matching entry here is unreachable.
 */

/** One example profile: the slug in the URL, and how it reads on screen. */
export interface DemoPersona {
  readonly slug: string;
  readonly label: string;
}

/**
 * The two profiles, in the order the switcher renders them.
 *
 * The first is the default, which is stated once below rather than left as an
 * unwritten property of this array's order.
 */
export const DEMO_PERSONAS = [
  { slug: "backend-engineer", label: "Backend engineer" },
  { slug: "product-designer", label: "Product designer" },
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
