import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import { AppHeader } from "@/features/app-shell/app-header";
import {
  readOwnProfile,
  readProfileSections,
  type Profile,
} from "@/features/profile/queries";
import {
  CONTROLS,
  CURRENT_VERSION_LABEL,
  EMPTY_STATE,
  PAGE_HEADING,
  READ_FAILURES,
  VERSIONS_HEADING,
  VERSION_GONE,
  restoreAccessibleName,
  savedSummary,
  versionRow,
} from "@/features/resume/copy";
import {
  parseResumePageState,
  type EditorSource,
} from "@/features/resume/page-state";
import {
  readResumeHistory,
  readResumeVersion,
  type ResumeHistory,
} from "@/features/resume/queries";
import { ResumeEditor } from "@/features/resume/resume-editor";
import { profileSeed } from "@/features/resume/seed";
import { formatLongDate } from "@/lib/dates";
import { MarkdownText } from "@/lib/markdown";
import { isFailure, success, type Result } from "@/lib/result";

/**
 * The master resume (spec 0024, AC-1 to AC-10).
 *
 * REACHED ONLY FROM THE CARD ON `/profile`, the same placement spec 0008 gives
 * `/applications`, so it composes `AppHeader` with no `current` and the signed
 * in navigation stays at two items.
 *
 * SERVER COMPONENTS READ, SERVER ACTIONS WRITE. This page reads and renders;
 * the one write is `saveResumeVersion()`, which verifies its own caller again.
 *
 * THE EDIT STATE IS THE URL (`page-state.ts`). Restore and "start from my
 * profile" live only on the plain view, never beside an open editor, so neither
 * can be reached while the editor holds unsaved text (AC-6).
 *
 * THE MARKDOWN IS RENDERED HERE, ON THE SERVER, and only here (spec 0024,
 * invariant 5). The editor is the client boundary and never receives rendered
 * output.
 */
export default async function ResumePage(props: PageProps<"/resume">) {
  const pageState = parseResumePageState(await props.searchParams);
  const profile = await readOwnProfile();

  if (isFailure(profile)) {
    /**
     * AC-10: no profile row, nothing to seed from and nothing to attach a
     * version to, so the reader goes where the profile is made. Every other
     * failure says so rather than showing an empty state that reads like "no
     * resume yet".
     */
    if (profile.kind === "record_not_found") redirect("/profile");

    return <ReadFailed />;
  }

  /**
   * The current text is skipped only for `from=profile`, the one editor source
   * that can never fall back to the plain view. A Restore target CAN (AC-8: a
   * well formed id that is not the caller's renders the plain view), and the
   * plain view shows the current version, so skipping it there once rendered
   * "You haven't written a resume yet" beside four saved versions, which
   * the build's own browser pass on 2026-09-30 caught.
   */
  const withContent =
    pageState.kind !== "edit" || pageState.source.kind !== "profile";
  const history = await readResumeHistory({ withContent });

  if (isFailure(history)) return <ReadFailed />;

  if (pageState.kind === "edit") {
    const opening = await editorText(
      pageState.source,
      profile.value,
      history.value,
    );

    if (isFailure(opening)) return <ReadFailed />;

    /** AC-8: a well formed id that is not one of the caller's own rows. */
    if (opening.value === undefined) {
      return <PlainView history={history.value} versionGone />;
    }

    return (
      <Page>
        <div className="mt-8">
          <ResumeEditor
            key={editorKey(pageState.source)}
            initialContent={opening.value}
            previousVersionNumber={
              history.value.versions[0]?.versionNumber ?? 0
            }
          />
        </div>
      </Page>
    );
  }

  return (
    <PlainView
      history={history.value}
      versionGone={pageState.kind === "version-gone"}
    />
  );
}

/**
 * The text the editor opens with (AC-2, AC-5, AC-6).
 *
 * @returns The text, `undefined` when a named version is not the caller's
 * (AC-8), or a failure when a read broke.
 */
async function editorText(
  source: EditorSource,
  profile: Profile,
  history: ResumeHistory,
): Promise<Result<string | undefined>> {
  if (source.kind === "version") {
    const version = await readResumeVersion(source.versionId);

    if (isFailure(version)) return version;

    return success(version.value?.content);
  }

  if (source.kind === "current" && history.current !== undefined) {
    return success(history.current.content);
  }

  return seedFor(profile);
}

/**
 * The profile seed, read fresh (AC-2).
 *
 * `readProfileSections()` is reused rather than a second set of reads, so the
 * resume is seeded from exactly the rows `/profile` shows. It also reads
 * search preferences, which the seed ignores: one extra cheap select on a
 * page opened rarely, against two copies of the same three reads.
 */
async function seedFor(profile: Profile): Promise<Result<string>> {
  const sections = await readProfileSections();

  if (isFailure(sections)) return sections;

  return success(
    profileSeed({
      fullName: profile.full_name,
      location: profile.location,
      summary: profile.summary,
      skills: sections.value.skills.map((skill) => skill.name),
      experience: sections.value.experience.map((entry) => ({
        title: entry.title,
        company: entry.company,
        description: entry.description,
        startedOn: entry.started_on,
        endedOn: entry.ended_on,
      })),
    }),
  );
}

/**
 * The editor's `key`, one per source, so a different Restore target mounts a
 * fresh editor with a fresh dirty baseline rather than reusing a stale one.
 */
function editorKey(source: EditorSource): string {
  return source.kind === "version" ? source.versionId : source.kind;
}

/**
 * A stored timestamp as the reader sees it, matching `/applications`.
 *
 * NO SILENT FALLBACK TO A PLAUSIBLE DATE: a value that does not parse is shown
 * as stored, so an unexpected shape is visible rather than hidden.
 */
function savedOn(createdAt: string): string {
  return formatLongDate(createdAt) ?? createdAt;
}

/** The shell every state of the page shares: header, `h1`, rhythm. */
function Page({ children }: { readonly children?: ReactNode }) {
  return (
    <>
      <AppHeader />

      <main className="flex-1">
        <Section weight="standard">
          {/* `COPY-14`, in every state; `COPY-15` reuses it on purpose. */}
          <Heading level={1}>{PAGE_HEADING}</Heading>
          {children}
        </Section>
      </main>
    </>
  );
}

/** The plain view: the empty state, or the rendered resume and its versions. */
function PlainView({
  history,
  versionGone,
}: {
  readonly history: ResumeHistory;
  readonly versionGone: boolean;
}) {
  const current = history.current;

  /**
   * THE EMPTY STATE KEYS ON THE VERSION LIST, NEVER ON `current` ALONE.
   * `current` is also absent when its text was not read, and reading that as
   * "no resume" is the default that reads like success the error model forbids.
   * Versions without the current text cannot happen by construction (rows are
   * never deleted), so it renders as the read failure it would be.
   */
  if (history.versions.length > 0 && current === undefined) {
    return <ReadFailed />;
  }

  return (
    <Page>
      {versionGone ? (
        <div className="mt-3">
          {/* `COPY-6`, AC-8: the same answer for stale, malformed or foreign. */}
          <FieldError>{VERSION_GONE}</FieldError>
        </div>
      ) : undefined}

      {current === undefined ? (
        <>
          {/* `COPY-1`, AC-1. */}
          <Text className="mt-3">{EMPTY_STATE}</Text>
          <div className="mt-6">
            <Button href="/resume?edit=resume&from=profile">
              {CONTROLS.startFromProfile}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Text variant="muted" className="mt-3">
            {savedSummary(savedOn(current.createdAt), history.versions.length)}
          </Text>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button href="/resume?edit=resume">{CONTROLS.edit}</Button>
            <Button variant="tertiary" href="/resume?edit=resume&from=profile">
              {CONTROLS.startFromProfile}
            </Button>
          </div>

          <Card tone="flat" as="article" className="mt-8">
            <MarkdownText source={current.content} />
          </Card>

          <Heading level={2} className="mt-12">
            {VERSIONS_HEADING}
          </Heading>

          {/*
           * Every version, newest first, never capped (AC-6). Viewing this
           * list or following a Restore link writes nothing: the editor only
           * prefills.
           */}
          <ol className="mt-4 flex flex-col gap-2">
            {history.versions.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1"
              >
                <Text as="span">
                  {versionRow(
                    version.versionNumber,
                    savedOn(version.createdAt),
                  )}
                </Text>
                {version.id === current.id ? (
                  <Text as="span" variant="eyebrow">
                    {CURRENT_VERSION_LABEL}
                  </Text>
                ) : undefined}
                <Button
                  variant="tertiary"
                  size="sm"
                  href={`/resume?edit=resume&from=${version.id}`}
                  label={restoreAccessibleName(version.versionNumber)}
                >
                  {CONTROLS.restore}
                </Button>
              </li>
            ))}
          </ol>
        </>
      )}
    </Page>
  );
}

/**
 * A read that failed (`COPY-27`, `COPY-28`).
 *
 * IT SAYS SO OUT LOUD, never an empty state: showing "You haven't written a
 * resume yet" during an outage would tell somebody with a resume they have
 * none. The failure already reported through `failure()` before this renders.
 */
function ReadFailed() {
  return (
    <Page>
      <div className="mt-3">
        <FieldError>{READ_FAILURES.page}</FieldError>
      </div>
      <div className="mt-6">
        <Button variant="secondary" href="/resume">
          {READ_FAILURES.retry}
        </Button>
      </div>
    </Page>
  );
}
