import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Text } from "@/components/ui/text";
import type { SelectOption } from "@/components/ui/select";

import { formatMonth, monthOf } from "./calendar";
import { CONTROLS, ENTRY_GONE, HEADINGS } from "./copy";
import { DeleteExperienceForm } from "./experience-delete-form";
import { ExperienceForm } from "./experience-form";
import { SectionCard } from "./section-card";
import type { WorkExperienceEntry } from "./queries";

/**
 * Work history, as a list, an add form, an edit form, or a delete confirmation
 * (spec 0010, AC-7, AC-7a, AC-8, AC-13).
 *
 * FOUR STATES, ALL NAMED BY THE URL. `?add=experience`,
 * `?edit=experience&entry=<id>` and `?delete=experience&entry=<id>` each render
 * one of them, and anything else renders the list. Nothing is toggled in the
 * browser, so every state is a real address and the server decides what is on
 * screen.
 *
 * AN ENTRY ID THAT RESOLVES TO NO ROW RENDERS THE LIST PLUS `COPY-4`, NEVER A
 * BLANK FORM (AC-13). A blank edit form would look like an entry with its fields
 * cleared, and saving it would silently turn an edit into an insert.
 */

/** The state this section is being asked to render. */
export type ExperienceView =
  | { readonly kind: "list" }
  | { readonly kind: "add" }
  | { readonly kind: "edit"; readonly entryId: string }
  | { readonly kind: "delete"; readonly entryId: string }
  /**
   * An entry was named in the URL and its id is not even a uuid, so there is
   * nothing to look up. It renders exactly what an id that looked fine and
   * matched no row renders, because to the reader they are the same event.
   */
  | { readonly kind: "gone" };

interface ExperienceSectionProps {
  readonly entries: readonly WorkExperienceEntry[];
  readonly view: ExperienceView;
  /** Bounded at the current year, built once on the server (AC-7). */
  readonly years: readonly SelectOption[];
}

export function ExperienceSection({
  entries,
  view,
  years,
}: ExperienceSectionProps) {
  if (view.kind === "gone") {
    return <EntryGone entries={entries} />;
  }

  if (view.kind === "add") {
    return (
      <SectionCard heading={HEADINGS.experience}>
        <ExperienceForm years={years} />
      </SectionCard>
    );
  }

  if (view.kind === "edit" || view.kind === "delete") {
    const entry = entries.find((candidate) => candidate.id === view.entryId);

    /**
     * The id parsed as a uuid and still matched nothing: deleted in another tab,
     * or never this caller's. Both land here, and both are told the same thing,
     * because saying which would confirm to a stranger that a given entry id
     * belongs to somebody.
     */
    if (entry === undefined) {
      return (
        <SectionCard heading={HEADINGS.experience} control={<AddRoleControl />}>
          {/* `COPY-4`, the engineer's, used verbatim. */}
          <Text className="text-muted">{ENTRY_GONE}</Text>
          <div className="mt-6">
            <EntryList entries={entries} />
          </div>
        </SectionCard>
      );
    }

    if (view.kind === "delete") {
      return (
        <SectionCard heading={HEADINGS.experience}>
          <DeleteExperienceForm
            entryId={entry.id}
            title={entry.title}
            company={entry.company}
          />
        </SectionCard>
      );
    }

    const started = monthOf(entry.started_on);
    const ended =
      entry.ended_on === undefined ? undefined : monthOf(entry.ended_on);

    return (
      <SectionCard heading={HEADINGS.experience}>
        <ExperienceForm
          entryId={entry.id}
          company={entry.company}
          title={entry.title}
          location={entry.location}
          description={entry.description}
          startedMonth={started === undefined ? "" : String(started.month)}
          startedYear={started === undefined ? "" : String(started.year)}
          endedMonth={ended === undefined ? "" : String(ended.month)}
          endedYear={ended === undefined ? "" : String(ended.year)}
          years={years}
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard heading={HEADINGS.experience} control={<AddRoleControl />}>
      <EntryList entries={entries} />
    </SectionCard>
  );
}

/**
 * The list, with `COPY-4` above it.
 *
 * ONE COMPONENT FOR BOTH WAYS OF GETTING HERE: an id that parsed and matched no
 * row, and an id that never parsed at all. They are the same event to the reader
 * and AC-13 asks for the same render, so a second copy of this markup is a
 * second place for them to drift apart. That drift is exactly what the malformed
 * id path did before 2026-09-02: it had no render of its own and fell through to
 * the plain list.
 */
function EntryGone({
  entries,
}: {
  readonly entries: readonly WorkExperienceEntry[];
}) {
  return (
    <SectionCard heading={HEADINGS.experience} control={<AddRoleControl />}>
      {/* `COPY-4`, the engineer's, used verbatim. */}
      <Text className="text-muted">{ENTRY_GONE}</Text>
      <div className="mt-6">
        <EntryList entries={entries} />
      </div>
    </SectionCard>
  );
}

/** `COPY-6`'s add control, in one place so the two renders cannot diverge. */
function AddRoleControl() {
  return (
    <Button
      variant="tertiary"
      size="sm"
      href="/profile?add=experience"
      label="Add a role to your work history"
    >
      {CONTROLS.addRole}
    </Button>
  );
}

/**
 * The entries, newest and current first.
 *
 * THE ORDER COMES FROM THE QUERY, not from a sort here. `readProfileSections()`
 * orders by `ended_on desc nulls first, started_on desc, created_at desc`, so a
 * current role is at the top and the list a reader sees after a save is the true
 * current order rather than a client held copy.
 */
function EntryList({
  entries,
}: {
  readonly entries: readonly WorkExperienceEntry[];
}) {
  if (entries.length === 0) {
    return (
      <Text className="text-muted">
        Not set yet. Add the roles you want a job to be measured against.
      </Text>
    );
  }

  return (
    <ul className="flex flex-col gap-6">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="border-t border-line pt-5 first:border-0 first:pt-0"
        >
          <Heading level={3} as="h3">
            {entry.title}
          </Heading>
          <Text className="mt-1">{entry.company}</Text>

          <Text variant="monoLabel" as="p" className="mt-1">
            {period(entry)}
          </Text>

          {entry.description === undefined ? undefined : (
            <Text className="mt-3 whitespace-pre-line">
              {entry.description}
            </Text>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <Button
              variant="tertiary"
              size="sm"
              href={`/profile?edit=experience&entry=${entry.id}`}
              label={`Edit ${entry.title} at ${entry.company}`}
            >
              {CONTROLS.edit}
            </Button>
            <Button
              variant="tertiary"
              size="sm"
              href={`/profile?delete=experience&entry=${entry.id}`}
              label={`Remove ${entry.title} at ${entry.company}`}
            >
              {CONTROLS.remove}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * One entry's dates, as words.
 *
 * Values are stored raw and formatted at render, per `AGENTS.md`. An absent
 * `ended_on` reads as the role still being held, which is what the absence means
 * (spec 0003's own reason for having no `is_current` column). The location joins
 * the same line because it belongs to the same "where and when" reading.
 */
function period(entry: WorkExperienceEntry): string {
  const started = formatMonth(entry.started_on);
  const ended =
    entry.ended_on === undefined ? "now" : formatMonth(entry.ended_on);
  const when = `${started} to ${ended}`;

  return entry.location === undefined ? when : `${when} · ${entry.location}`;
}
