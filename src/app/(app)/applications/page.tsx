import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import { ApplicationCard } from "@/features/applications/application-card";
import { APPLICATIONS_COPY, CONTROLS } from "@/features/applications/copy";
import { APPLICATION_FAILURES } from "@/features/applications/failures";
import {
  readApplications,
  type ApplicationRow,
} from "@/features/applications/queries";
import { RemoveForm } from "@/features/applications/remove-form";
import { AppHeader } from "@/features/app-shell/app-header";
import { isFailure } from "@/lib/result";

/**
 * Applications (spec 0014, AC-3, AC-8, AC-11, AC-17, AC-18).
 *
 * IT NOW DOES WHAT ITS OWN COPY PROMISED. Feature 32 shipped this page with the
 * sentence "Every job you apply to will be recorded here", live on production
 * with nothing behind it. The sentence stays, because it reads correctly as a
 * description of an empty page, and the page finally keeps it.
 *
 * READING HERE COSTS NO ADZUNA CALL (AC-3), which is the reason this list
 * exists at all rather than waiting for feature 23's dashboard. The only other
 * way to see a recorded application would be to re-run the search that found
 * it, and that spends one of 25 calls a week.
 *
 * A SERVER COMPONENT READING THE CALLER'S OWN ROWS. Row level security is the
 * guarantee: every policy on `application` compares `(select auth.uid()) =
 * profile_id`, so this reads the caller's rows by construction.
 */
export default async function ApplicationsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  /**
   * A repeated parameter arrives as an array. The first value is taken rather
   * than the pair joined, the same handling `/search` uses.
   */
  const raw = params["remove"];
  const removeId = Array.isArray(raw) ? raw[0] : raw;

  const applications = await readApplications();

  return (
    <>
      <AppHeader />

      <main className="flex-1">
        <Section weight="standard">
          <Heading level={1}>{APPLICATIONS_COPY.heading}</Heading>

          {/* `COPY-3`, the engineer's, used verbatim, unchanged since feature 32. */}
          <Text className="text-muted mt-3">{APPLICATIONS_COPY.intro}</Text>

          {isFailure(applications) ? (
            /*
             * `AGENTS.md`: no silent failures. An empty page here would claim
             * the reader has applied to nothing, which is a statement of fact
             * this app cannot make when the read failed.
             */
            <div role="alert" className="mt-6">
              <Text className="text-secondary">
                {APPLICATION_FAILURES.database_unavailable.message}
              </Text>
            </div>
          ) : (
            <ApplicationsBody
              applications={applications.value}
              removeId={removeId}
            />
          )}
        </Section>
      </main>
    </>
  );
}

/** The list, the confirmation, or the empty state. */
function ApplicationsBody({
  applications,
  removeId,
}: {
  readonly applications: readonly ApplicationRow[];
  readonly removeId: string | undefined;
}) {
  /**
   * PASSED DOWN FROM ONE PLACE (spec 0013's result list does the same), so
   * every relative date on the page is measured from the same instant rather
   * than each card reading the clock as it renders.
   */
  const now = new Date();

  const removing =
    removeId === undefined
      ? undefined
      : applications.find((application) => application.id === removeId);

  /*
   * AC-11: the confirmation reads from the rows this page already holds, so
   * naming the job costs no extra query and no fifth span.
   */
  if (removing !== undefined) {
    return (
      <div className="mt-8">
        <RemoveForm
          applicationId={removing.id}
          title={removing.title}
          companyName={removing.companyName}
        />
      </div>
    );
  }

  /*
   * AC-17: the empty state keeps the promise sentence above and adds a way out,
   * so a reader with no applications is not left at a dead end. AC-8: a page
   * with no rows shows no attribution, because there is no advert to attribute.
   */
  if (applications.length === 0) {
    return (
      <div className="mt-6">
        <Button href="/search">{CONTROLS.searchForJobs}</Button>
      </div>
    );
  }

  return (
    <ul className="mt-8 flex flex-col gap-6">
      {applications.map((application) => (
        <li key={application.id}>
          <ApplicationCard application={application} now={now} />
        </li>
      ))}
    </ul>
  );
}
