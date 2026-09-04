import { Button } from "@/components/ui/button";
import { Field, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { SEARCH_COPY } from "./copy";

/**
 * The search form (spec 0013, Decision).
 *
 * A PLAIN `GET` FORM, WITH NO CLIENT JAVASCRIPT AT ALL. Submitting it is an
 * ordinary browser navigation to `/search?q=...&where=...`, which is what
 * makes a search shareable, bookmarkable, and survivable across a reload, and
 * what lets it reuse spec 0008's already tested deep link return path verbatim.
 * A Server Action here would have thrown that away for a loading spinner
 * nothing else in this product uses.
 *
 * THE FIELDS ARE UNCONTROLLED, prefilled with `defaultValue`. What the reader
 * typed survives because the URL carries it and the page renders it back, not
 * because any state is held in the browser.
 */
export function SearchForm({
  title,
  location,
  error,
}: {
  /** Prefilled from the URL, or from `job_preference` on a bare visit (AC-9). */
  readonly title?: string;
  readonly location?: string;
  /** `COPY-3`, shown when both fields were submitted blank (AC-2). */
  readonly error?: string;
}) {
  return (
    <form
      method="get"
      action="/search"
      className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end"
    >
      <Field
        id="search-title"
        label={SEARCH_COPY.titleLabel}
        className="flex-1"
      >
        <Input
          id="search-title"
          name="q"
          defaultValue={title}
          maxLength={200}
          autoComplete="off"
        />
      </Field>

      <Field
        id="search-location"
        label={SEARCH_COPY.locationLabel}
        className="flex-1"
      >
        <Input
          id="search-location"
          name="where"
          defaultValue={location}
          maxLength={200}
          autoComplete="off"
        />
      </Field>

      <Button type="submit">Search</Button>

      {/*
       * The message belongs to the form as a whole, not to either field: AC-2
       * refuses the pair being blank, and neither one is individually wrong.
       * `FieldError` with no `id` is exactly that case, and it still announces
       * itself through `role="alert"`.
       */}
      {error === undefined ? undefined : (
        <div className="sm:w-full">
          <FieldError>{error}</FieldError>
        </div>
      )}
    </form>
  );
}
