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
  | { readonly kind: "delete-experience"; readonly entryId: string };

/** The plain view, which every unrecognised combination falls back to. */
const VIEW: PageState = { kind: "view" };

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
     * A confirmation URL with no usable id is not a confirmation of anything, so
     * it falls to the plain view. The page renders `COPY-4` beside it, which is
     * the same thing a stale id gets (AC-13).
     */
    return entry.success
      ? { kind: "delete-experience", entryId: entry.data }
      : VIEW;
  }

  if (single(params.add) === "experience") {
    return { kind: "add-experience" };
  }

  const section = asSection(single(params.edit));

  if (section === undefined) return VIEW;

  /**
   * `?edit=experience` names the whole section, and one entry inside it is
   * named by adding `entry`. Without a usable id it is the add form's URL
   * without the add, so it falls to the plain view rather than opening a blank
   * form that would silently turn an edit into an insert.
   */
  if (section === "experience") {
    return entry.success
      ? { kind: "edit-experience", entryId: entry.data }
      : VIEW;
  }

  return { kind: "edit", section };
}

/**
 * Whether the URL asked for an entry that could not be shown.
 *
 * SEPARATE FROM `parsePageState` ON PURPOSE. The parse falls back to the plain
 * view, which is the right render, but falling back silently would leave
 * somebody who clicked a stale link looking at a page that simply ignored them.
 * This is what tells the page to show `COPY-4` alongside it.
 *
 * It answers `true` for a malformed id and for a well formed one, because
 * whether the id resolves to a row is not knowable from the URL. The page
 * checks the loaded entries for the second half.
 */
export function askedForEntry(
  params: Readonly<Record<string, string | string[] | undefined>>,
): boolean {
  const target = single(params.edit) ?? single(params.delete);

  return target === "experience" && single(params.entry) !== undefined;
}
