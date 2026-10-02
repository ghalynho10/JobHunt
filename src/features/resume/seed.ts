import { formatMonth } from "@/features/profile/calendar";

import { normalizeLineBreaks } from "./line-breaks";

/**
 * The profile seed: the first draft of a resume, written from the profile
 * (spec 0024, AC-2).
 *
 * A PURE FUNCTION OF THE VALUES IT IS GIVEN. The page reads the profile and
 * hands the rows in, so the template is testable without a database and the
 * reads stay where the spans are.
 *
 * THE TEMPLATE IS THE SPEC'S, EXACTLY. The name and the location as two
 * paragraphs, then the summary, then
 * `## Skills`, `## Experience` and an always present, always empty
 * `## Education`, each block separated by one blank line. A block with nothing
 * in it is omitted whole rather than left as a heading over nothing, except
 * Education, which the spec keeps as the one place education can live (AC-14).
 *
 * WHAT IS LEFT OUT, ON PURPOSE: any contact line (`public.profile` has no email
 * or phone column, and the sign in email belongs to authentication), and
 * `work_experience.location` (AC-2 matches spec 0010 AC-18's restraint).
 *
 * NEVER TRUNCATED. A long profile can produce a seed over the 20000 character
 * ceiling, and it is returned in full so nothing the reader already wrote is
 * silently dropped. Save then refuses it with `COPY-11` until they trim it.
 *
 * THE DASHES IN THE EXPERIENCE LINE ARE THE SPEC'S TEMPLATE, not product copy.
 * An em dash separates the title from the company and an en dash the two
 * months, exactly as AC-2 writes the line. They land in the reader's own
 * editable resume text, which spec 0007's punctuation rule for `COPY-` slots
 * does not govern.
 */

/** The profile values the seed is written from. */
export interface SeedInput {
  readonly fullName: string;
  readonly location: string | undefined;
  readonly summary: string | undefined;
  readonly skills: readonly string[];
  readonly experience: readonly SeedExperience[];
}

/** One work history entry, with its dates as stored (`YYYY-MM-DD`). */
export interface SeedExperience {
  readonly title: string;
  readonly company: string;
  readonly description: string | undefined;
  readonly startedOn: string;
  readonly endedOn: string | undefined;
}

/**
 * Most recently started first (AC-2).
 *
 * A DIFFERENT ORDER FROM THE PROFILE PAGE, which lists current roles first
 * (`readProfileSections`). The sort is stable, so two roles started in the same
 * month keep the order they arrived in. The dates compare as strings because
 * `YYYY-MM-DD` sorts the same way as the calendar.
 */
function mostRecentlyStartedFirst(
  experience: readonly SeedExperience[],
): readonly SeedExperience[] {
  return [...experience].sort((left, right) =>
    right.startedOn.localeCompare(left.startedOn),
  );
}

/** `**title** — company (March 2019 – Present)`, then the description. */
function experienceEntry(entry: SeedExperience): string {
  const ended =
    entry.endedOn === undefined ? "Present" : formatMonth(entry.endedOn);
  const line = `**${entry.title}** — ${entry.company} (${formatMonth(entry.startedOn)} – ${ended})`;

  return entry.description === undefined
    ? line
    : `${line}\n\n${entry.description}`;
}

/** The markdown the editor opens with when there is no resume to start from. */
export function profileSeed(input: SeedInput): string {
  /**
   * A BLANK LINE BETWEEN THE NAME AND THE LOCATION, not a single line break:
   * markdown renders a single break as a space, so the two once came out as
   * one line, "Avery Fixture Springfield, IL" (`/check verify`, 2026-09-30).
   */
  const header = [input.fullName, input.location]
    .filter((line): line is string => line !== undefined)
    .join("\n\n");

  const skills =
    input.skills.length === 0
      ? undefined
      : `## Skills\n\n${input.skills.map((name) => `- ${name}`).join("\n")}`;

  const experience =
    input.experience.length === 0
      ? undefined
      : `## Experience\n\n${mostRecentlyStartedFirst(input.experience)
          .map(experienceEntry)
          .join("\n\n")}`;

  /**
   * Line breaks normalised because the profile stores its own textareas as the
   * browser posted them, `\r\n` and all, and those rows already exist. Left in,
   * the seed never equals the field it opens in and the editor calls itself
   * unsaved before anyone types (`line-breaks.ts`).
   */
  return normalizeLineBreaks(
    `${[header, input.summary, skills, experience, "## Education"]
      .filter((block): block is string => block !== undefined)
      .join("\n\n")}\n`,
  );
}
