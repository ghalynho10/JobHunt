import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import { AppHeader } from "@/features/app-shell/app-header";
import { searchListings } from "@/features/search/adzuna";
import { SEARCH_COPY } from "@/features/search/copy";
import { readSearchPrefill } from "@/features/search/preferences";
import { ResultCard } from "@/features/search/result-card";
import { SearchForm } from "@/features/search/search-form";
import { isFailure } from "@/lib/result";
import { SENTENCES } from "@/lib/usage-gating/copy";

/**
 * Search (spec 0013).
 *
 * A SERVER COMPONENT READING THE SEARCH TERMS FROM THE URL, never a Server
 * Action and never a client side fetch (Decision). The whole operation, gate
 * check, Adzuna call and parse, runs server side in `searchListings()`, so no
 * client JavaScript ships for search at all and a shared `/search?q=...` link
 * is a real, working search.
 *
 * A BARE VISIT RUNS NO SEARCH AND SPENDS NO BUDGET (AC-9). The URL carrying
 * `q` or `where` is the whole signal: absent, the page prefills from the
 * caller's own `job_preference` row and stops there.
 *
 * A RELOAD, A BACK NAVIGATION AND A SHARED LINK EACH SPEND ONE GATE CHECK AND
 * ONE ADZUNA CALL (AC-10, Consequences). Each is a distinct render carrying
 * the same params, and there is no client side cache to serve a repeat view
 * from, so the weekly cap is a cap on renders rather than on distinct intents
 * to search. That cost is recorded rather than engineered around.
 */
export default async function SearchPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  /**
   * A repeated parameter (`?q=a&q=b`) arrives as an array. The first value is
   * taken rather than the pair joined, so a crafted URL cannot smuggle a
   * second term into one field.
   */
  const single = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const q = single(params["q"]);
  const where = single(params["where"]);
  const hasQuery = q !== undefined || where !== undefined;

  return (
    <>
      <AppHeader current="search" />

      <main className="flex-1">
        <Section weight="standard">
          <Heading level={1}>Search</Heading>

          {hasQuery ? (
            <SearchResults title={q} location={where} />
          ) : (
            <PrefilledForm />
          )}
        </Section>
      </main>
    </>
  );
}

/**
 * A bare visit: the form, prefilled from the caller's stated preferences.
 *
 * IT NEVER CALLS `searchListings()` (AC-9). A prefill failure falls back to
 * empty fields rather than blocking the form: the reader can still type a
 * search, and the failure is already reported by `failure()` itself.
 */
async function PrefilledForm() {
  const prefill = await readSearchPrefill();

  if (isFailure(prefill)) {
    return <SearchForm />;
  }

  return (
    <SearchForm title={prefill.value.title} location={prefill.value.location} />
  );
}

/**
 * A search: the form carrying what was asked for, and exactly one of the four
 * outcomes below.
 *
 * THE THREE VISIBLE STATES ARE DISTINCT ON PURPOSE (AC-3, AC-4, AC-5). A gate
 * refusal, an empty result and a failure are three different things that have
 * happened, and a reader deciding what to do next needs to tell them apart.
 */
async function SearchResults({
  title,
  location,
}: {
  readonly title: string | undefined;
  readonly location: string | undefined;
}) {
  const result = await searchListings({ title, location });

  /**
   * AC-2: both fields blank is refused before the gate is checked and before
   * any Adzuna call runs, and it is the one failure shown on the form itself
   * rather than in place of the results.
   */
  if (isFailure(result) && result.kind === "validation_failed") {
    return (
      <SearchForm
        title={title}
        location={location}
        error={SEARCH_COPY.bothFieldsBlank}
      />
    );
  }

  return (
    <>
      <SearchForm title={title} location={location} />

      <div className="mt-10">
        <SearchOutcome result={result} />
      </div>
    </>
  );
}

function SearchOutcome({
  result,
}: {
  readonly result: Awaited<ReturnType<typeof searchListings>>;
}) {
  /**
   * AC-5: the failure state. One sentence for every way the search itself
   * broke, because the difference between a timeout and a malformed body is
   * not something a reader can act on. The specific kind is already in
   * Sentry, reported by `failure()` at the point it happened.
   */
  if (isFailure(result)) {
    return (
      <div role="alert">
        <Text className="text-secondary">{SEARCH_COPY.searchFailed}</Text>
      </div>
    );
  }

  /**
   * AC-3: the refusal state, rendering feature 10's own sentence verbatim.
   * This feature writes no copy for the five reasons; `SENTENCES` is keyed by
   * the reason `checkUsageGate()` returned.
   */
  if (!result.value.allowed) {
    return (
      <div role="alert">
        <Text className="text-secondary">{SENTENCES[result.value.reason]}</Text>
      </div>
    );
  }

  const listings = result.value.value;

  /**
   * AC-4: the empty state. NO `role="alert"`, deliberately: a search that
   * legitimately matched nothing is an ordinary outcome, not a failure, which
   * is the same convention the placeholder page this replaced already set.
   */
  if (listings.length === 0) {
    return <Text className="text-muted">{SEARCH_COPY.noResults}</Text>;
  }

  /**
   * ONE `now` FOR THE WHOLE LIST, so twenty cards cannot disagree about what
   * "today" is mid render.
   */
  const now = new Date();

  return (
    <ul className="space-y-4">
      {listings.map((listing) => (
        <li key={`${listing.source}:${listing.sourceJobId}`}>
          <ResultCard listing={listing} now={now} />
        </li>
      ))}
    </ul>
  );
}
