import { entryIdSchema } from "./schemas";

/**
 * What `/profile` is showing, read entirely from the URL (spec 0010, AC-13).
 *
 * THE EDIT STATE IS A SEARCH PARAMETER, NEVER CLIENT TOGGLE STATE. That is the
 * decision spec 0010 records, and it buys three things: every edit form is
 * reachable at a stable URL, the server renders it, and the no browser Server
 * Action test (AC-14) can fetch a page with a form already open instead of
 * needing a browser to click something first.
 *
 * AN UNRECOGNISED VALUE RENDERS THE PLAIN VIEW, NEVER AN ERROR PAGE. The query
 * string is untrusted input, so it is parsed against a closed set at the
 * boundary. Nothing a stranger can type into it produces a crash, and nothing
 * about the shape of the response tells them which values were recognised.
 */

/** The four sections, and the only names the `edit` parameter accepts. */
export const SECTIONS = [
  "identity",
  "skills",
  "experience",
  "preferences",
] as const;

export type Section = (typeof SECTIONS)[number];

/**
 * The page's whole state.
 *
 * A DISCRIMINATED UNION, so a state that carries an entry id and a state that
 * does not are different types rather than one type with an optional field
 * every reader has to check. `edit-experience` and `delete-experience` cannot
 * exist without an id, and the compiler is what says so.
 */
export type PageState =
  | { readonly kind: "view" }
  | { readonly kind: "edit"; readonly section: Section }
  | { readonly kind: "add-experience" }
  | { readonly kind: "edit-experience"; readonly entryId: string }
  | { readonly kind: "delete-experience"; readonly entryId: string }
  /**
   * An `entry` was named but its id is not a uuid, so no row can be looked up.
   *
   * IT IS ITS OWN STATE RATHER THAN A FALL BACK TO `view`, and that is the whole
   * point of AC-13. A malformed id and a stale one are the same thing to the
   * reader (the entry they clicked is not there), so they have to render the
   * same thing. Collapsing this into `view` loses the only fact the page needs
   * to say so, which is exactly the bug `/check verify` caught on 2026-09-02:
   * the page rendered the list and silently ignored the request.
   */
  | { readonly kind: "entry-gone" };

/** The plain view, which every unrecognised combination falls back to. */
const VIEW: PageState = { kind: "view" };

/**
 * An entry was asked for and cannot be shown.
 *
 * Reached only when an `entry` value is actually present and fails the uuid
 * parse. An ABSENT `entry` is a different thing: `?edit=experience` on its own
 * names the section with no row in it, which is the plain view.
 */
const ENTRY_GONE: PageState = { kind: "entry-gone" };

/**
 * A single string value, or `undefined`.
 *
 * A REPEATED PARAMETER (`?edit=identity&edit=skills`) ARRIVES AS AN ARRAY and is
 * treated as absent rather than as its first element. Picking one would be this
 * function deciding which of two conflicting instructions the visitor meant.
 */
function single(
  value: string | readonly string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Whether a raw value is one of the four section names. */
function asSection(value: string | undefined): Section | undefined {
  return SECTIONS.find((section) => section === value);
}

/**
 * The page state named by the query string.
 *
 * THE ORDER IS DELETE, THEN ADD, THEN EDIT, and it only matters for a URL
 * carrying more than one at once, which the product's own links never build. It
 * is fixed here so that a hand typed combination renders the same thing every
 * time rather than whatever the object's key order happened to be.
 *
 * @param params The resolved `searchParams` of `/profile`.
 */
export function parsePageState(
  params: Readonly<Record<string, string | string[] | undefined>>,
): PageState {
  const entry = entryIdSchema.safeParse(single(params.entry));

  if (single(params.delete) === "experience") {
    /**
     * A confirmation URL with no usable id is not a confirmation of anything.
     * With an id present but malformed it is `entry-gone`, so the page says the
     * entry is not there; with no id at all it is the plain view, because
     * nothing was asked for (AC-13).
     */
    if (entry.success) {
      return { kind: "delete-experience", entryId: entry.data };
    }

    return single(params.entry) === undefined ? VIEW : ENTRY_GONE;
  }

  if (single(params.add) === "experience") {
    return { kind: "add-experience" };
  }

  const section = asSection(single(params.edit));

  if (section === undefined) return VIEW;

  /**
   * `?edit=experience` names the whole section, and one entry inside it is
   * named by adding `entry`. Either way it never opens a blank form, which
   * would silently turn an edit into an insert. With no `entry` at all it is
   * the add form's URL without the add, so it is the plain view; with a
   * malformed one it is `entry-gone`.
   */
  if (section === "experience") {
    if (entry.success) {
      return { kind: "edit-experience", entryId: entry.data };
    }

    return single(params.entry) === undefined ? VIEW : ENTRY_GONE;
  }

  return { kind: "edit", section };
}
