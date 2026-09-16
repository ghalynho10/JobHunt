import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";

import type { DemoPersona } from "./personas";

/**
 * One example candidate, shown in full (spec 0021, AC-3, AC-14).
 *
 * THIS COMPONENT IS THE DISCLOSURE, and that is why it renders everything
 * rather than a summary. The listings on this page are real and their scores
 * are real; the candidate is the one invented input. A reader can only judge
 * whether a band is fair if they can see exactly what the scorer was told, so
 * this shows the same four things `boundProfile()` puts in the prompt, in the
 * same order: the summary, the skills, the work history, the preferences.
 * Showing three of the four would leave a reader assuming the fourth said
 * something it did not.
 *
 * IT READS THE SAME CONSTANT THE REFRESH SCORES WITH, not a copy written for
 * display. `DemoPersona.profile` is the exact `ScoringProfile` handed to
 * `scoreListings()`, so the two cannot drift: a skill added for the scorer and
 * forgotten here would be invisible on the page while quietly changing every
 * band, which is the one failure this disclosure exists to make impossible.
 *
 * THE EMPLOYERS IN THE WORK HISTORY ARE OBVIOUSLY FICTIONAL ON PURPOSE. They
 * sit on the same page as real employers' names on the listing cards, so they
 * are written in a register nobody can mistake for one.
 */
export function PersonaProfile({ persona }: { readonly persona: DemoPersona }) {
  const { profile } = persona;

  return (
    <Card tone="flat" as="article">
      <Card.Header>
        <Heading level={3}>{persona.label}</Heading>
      </Card.Header>

      <Card.Body>
        {profile.summary === undefined ? undefined : (
          <Text variant="monoData">{profile.summary}</Text>
        )}

        <div className="mt-4">
          <Text variant="eyebrow" className="text-secondary">
            Skills
          </Text>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.skills.map((skill) => (
              /*
               * `state="matched"` IS THE PROJECT'S CHIP FOR A SKILL SOMEBODY
               * HAS, not only for one found in a posting: it is what
               * `src/features/profile/skills-section.tsx` renders a real
               * person's own skills with, and what the entry page's example
               * profile uses. These are the candidate's own skills in exactly
               * that sense, so they take the same chip a real profile does.
               */
              <Chip key={skill} state="matched">
                {skill}
              </Chip>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <Text variant="eyebrow" className="text-secondary">
            Work history
          </Text>
          <ul className="mt-2 space-y-3">
            {profile.experience.map((entry) => (
              <li key={`${entry.company}-${entry.startedOn}`}>
                <Text variant="monoLabel" as="span" className="block">
                  {`${entry.title} · ${entry.company}`}
                </Text>
                <Text variant="muted" as="span" className="block">
                  {/*
                   * AN OPEN ENDED ROLE READS AS "to now", never as a blank
                   * where a date should be. `endedOn` absent is the same fact
                   * the scorer is given, which is that this is the current
                   * job.
                   */}
                  {`${entry.startedOn} to ${entry.endedOn ?? "now"}`}
                </Text>
                {entry.description === undefined ? undefined : (
                  <Text variant="monoData" className="mt-1">
                    {entry.description}
                  </Text>
                )}
              </li>
            ))}
          </ul>
        </div>

        {profile.preferences === undefined ? undefined : (
          <div className="mt-4">
            <Text variant="eyebrow" className="text-secondary">
              Search preferences
            </Text>
            <ul className="mt-2 space-y-1">
              <li>
                <Text variant="muted" as="span">
                  {`Wants: ${profile.preferences.desired_titles.join(", ")}`}
                </Text>
              </li>
              <li>
                <Text variant="muted" as="span">
                  {`Locations: ${profile.preferences.desired_locations.join(", ")}`}
                </Text>
              </li>
              <li>
                <Text variant="muted" as="span">
                  {/*
                   * THE RAW STORED VALUE, FORMATTED AT RENDER, the same rule
                   * the rest of this project follows for pay. The scorer is
                   * given the number and the currency as two fields, so the
                   * two are shown together here rather than as a pre-formatted
                   * string that could disagree with what was sent.
                   */}
                  {preferenceLine(profile.preferences)}
                </Text>
              </li>
            </ul>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

/** The remote and pay line, or just the remote half when no pay is set. */
function preferenceLine(
  preferences: NonNullable<DemoPersona["profile"]["preferences"]>,
): string {
  const remote = REMOTE_LABELS[preferences.remote_preference];

  if (
    preferences.minimum_pay === undefined ||
    preferences.minimum_pay_currency === undefined
  ) {
    return remote;
  }

  const pay = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: preferences.minimum_pay_currency,
    maximumFractionDigits: 0,
  }).format(preferences.minimum_pay);

  return `${remote} · from ${pay}`;
}

/**
 * The four stored values, in words.
 *
 * WRITTEN OUT RATHER THAN DERIVED FROM THE SLUG, because `no_preference` would
 * become "no preference" under any mechanical transform and that reads as a
 * database value on a page for readers. The four are fixed by the column's own
 * check constraint, so this map cannot fall behind silently: a fifth value
 * would fail the type here.
 */
const REMOTE_LABELS = {
  on_site: "On site",
  hybrid: "Hybrid",
  remote: "Remote",
  no_preference: "No location preference",
} as const;
