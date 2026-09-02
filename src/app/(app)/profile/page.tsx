import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import { AppHeader } from "@/features/app-shell/app-header";
import { currentMonth, yearOptions } from "@/features/profile/calendar";
import { FIRST_RUN_NOTE, HEADINGS } from "@/features/profile/copy";
import {
  ExperienceSection,
  type ExperienceView,
} from "@/features/profile/experience-section";
import { IdentityForm } from "@/features/profile/identity-form";
import { FormMessage } from "@/features/profile/form-message";
import { IdentitySection } from "@/features/profile/identity-section";
import { parsePageState, type PageState } from "@/features/profile/page-state";
import { PreferencesSection } from "@/features/profile/preferences-section";
import {
  readOwnProfile,
  readProfileSections,
} from "@/features/profile/queries";
import { SkillsSection } from "@/features/profile/skills-section";
import { isFailure } from "@/lib/result";

/**
 * Profile (spec 0010; spec 0008, AC-1, AC-2).
 *
 * WHERE A FIRST TIME VISITOR LANDS. The landing rule sends anybody with no
 * profile row here, so this is the first screen most people see after signing
 * in, and AC-1 makes it a single form rather than four empty sections.
 *
 * IT CARRIES THE ONLY LINK TO `/applications` (spec 0008, AC-1). That route is
 * deliberately not in the navigation, and this link is what keeps it from being
 * reachable only by typing its URL.
 *
 * SERVER COMPONENTS READ, SERVER ACTIONS WRITE. This page reads and renders.
 * Every write is a Server Action in `src/features/profile/actions.ts`, each
 * verifying its own caller again, because a Server Action is a callable endpoint
 * whatever page renders it.
 *
 * THE EDIT STATE IS THE URL, parsed against a closed set at the boundary
 * (AC-13). An unrecognised value renders the plain view rather than an error
 * page, and a malformed or stale entry id renders the list with `COPY-4` beside
 * it rather than a blank form that would silently turn an edit into an insert.
 */
export default async function ProfilePage(props: PageProps<"/profile">) {
  const pageState = parsePageState(await props.searchParams);
  const profile = await readOwnProfile();

  if (isFailure(profile)) {
    /**
     * AN ABSENT ROW IS THE FIRST RUN, AND NOTHING ELSE IS (AC-1). Every other
     * failure renders a visible failure state instead, per the "no default that
     * reads like success" rule: showing the empty starter form during a database
     * outage would tell somebody with a full profile that they have none, and
     * inviting them to type it again is worse than saying the read failed.
     */
    if (profile.kind === "record_not_found") return <FirstRun />;

    return <ReadFailed message={profile.message} />;
  }

  const sections = await readProfileSections();

  if (isFailure(sections)) return <ReadFailed message={sections.message} />;

  /**
   * Built once here rather than inside the form, so both the add and the edit
   * form are bounded by the same year and the clock is read in one place.
   */
  const years = yearOptions(currentMonth().year);

  return (
    <>
      <AppHeader current="profile" />

      <main className="flex-1">
        <Section weight="standard">
          <Heading level={1}>{HEADINGS.page}</Heading>

          <div className="mt-8 flex flex-col gap-6">
            <IdentitySection
              profile={profile.value}
              editing={isEditing(pageState, "identity")}
            />

            <SkillsSection
              skills={sections.value.skills}
              editing={isEditing(pageState, "skills")}
            />

            <ExperienceSection
              entries={sections.value.experience}
              view={experienceView(pageState)}
              years={years}
            />

            <PreferencesSection
              preferences={sections.value.preferences}
              editing={isEditing(pageState, "preferences")}
            />
          </div>

          <div className="mt-8">
            {/* Spec 0008's `COPY-6`, the mock up's own wording for this link. */}
            <Button variant="tertiary" href="/applications">
              Tracked applications
            </Button>
          </div>
        </Section>
      </main>
    </>
  );
}

/** Whether the URL opened this particular section for editing. */
function isEditing(
  state: PageState,
  section: "identity" | "skills" | "preferences",
): boolean {
  return state.kind === "edit" && state.section === section;
}

/**
 * Which of the work history section's four states the URL asked for.
 *
 * The mapping is here rather than in `page-state.ts` because the page state is
 * about the whole page and this is about one section. Anything not naming work
 * history is the list, which is also what an unrecognised value falls back to.
 */
function experienceView(state: PageState): ExperienceView {
  if (state.kind === "add-experience") return { kind: "add" };
  if (state.kind === "edit-experience") {
    return { kind: "edit", entryId: state.entryId };
  }
  if (state.kind === "delete-experience") {
    return { kind: "delete", entryId: state.entryId };
  }

  return { kind: "list" };
}

/**
 * The first run screen: the identity form, and nothing else (AC-1).
 *
 * NO OTHER SECTION CARD RENDERS. Skills, experience and preferences all hang off
 * a profile row that does not exist yet, so a control for any of them could not
 * do anything. `COPY-1` names what comes next in one plain line instead, which
 * is the difference between telling somebody what is ahead and offering them
 * something that will fail.
 */
function FirstRun() {
  return (
    <>
      <AppHeader current="profile" />

      <main className="flex-1">
        <Section weight="standard">
          <Heading level={1}>{HEADINGS.page}</Heading>

          {/* `COPY-1`, the engineer's, used verbatim. */}
          <Text className="mt-3 text-muted">{FIRST_RUN_NOTE}</Text>

          <div className="mt-8 max-w-xl">
            <IdentityForm existing={false} />
          </div>
        </Section>
      </main>
    </>
  );
}

/**
 * A read that failed for a reason other than the row not existing.
 *
 * IT SAYS SO OUT LOUD. `AGENTS.md`: a failure is always visible, never a default
 * that reads like success. The failure has already reported through `failure()`
 * and already marked its span failed by the time this renders, so this is the
 * half the person in front of the screen gets.
 */
function ReadFailed({ message }: { readonly message: string }) {
  return (
    <>
      <AppHeader current="profile" />

      <main className="flex-1">
        <Section weight="standard">
          <Heading level={1}>{HEADINGS.page}</Heading>
          <div className="mt-3">
            {/*
             * The same treatment a failed save gets, so a failed read and a
             * failed write do not look like different kinds of problem.
             * `role="alert"` comes with it, which is what announces the
             * sentence rather than leaving it to be found.
             */}
            <FormMessage message={message} />
          </div>
          <div className="mt-6">
            <Button variant="secondary" href="/profile">
              Try again
            </Button>
          </div>
        </Section>
      </main>
    </>
  );
}
