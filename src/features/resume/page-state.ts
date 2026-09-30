import { versionIdSchema } from "./schemas";

/**
 * What `/resume` is showing, read entirely from the URL (spec 0024, AC-5,
 * AC-6, AC-8).
 *
 * THE SAME RULE AS `src/features/profile/page-state.ts`: the edit state is a
 * search parameter parsed against a closed set, and an unrecognised value
 * renders the plain view, never an error page (AC-5). The query string is
 * untrusted input, so nothing typed into it can crash the page.
 */

/** Where the editor's text comes from. */
export type EditorSource =
  /** No `from`: the current version, or the profile seed when none exists. */
  | { readonly kind: "current" }
  /** `from=profile`: the profile seed, whether or not a resume exists. */
  | { readonly kind: "profile" }
  /** `from=<uuid>`: that version, if it is one of the caller's own. */
  | { readonly kind: "version"; readonly versionId: string };

/** The page's whole state. */
export type ResumePageState =
  | { readonly kind: "view" }
  | { readonly kind: "edit"; readonly source: EditorSource }
  /**
   * A `from` that is not `profile` and not a uuid (AC-8). Its own state rather
   * than a fall back to `view`, because the page has to SAY the version is gone,
   * the same lesson spec 0010's `entry-gone` records.
   */
  | { readonly kind: "version-gone" };

/**
 * A single string value, or `undefined`. A repeated parameter arrives as an
 * array and is treated as absent, rather than this function picking which of
 * two conflicting instructions the visitor meant.
 */
function single(
  value: string | readonly string[] | undefined,
): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * The page state named by the query string.
 *
 * `from` IS READ ONLY WHEN `edit=resume`. On the plain view it names nothing,
 * so a stray `from` there is ignored rather than reported as gone.
 *
 * @param params The resolved `searchParams` of `/resume`.
 */
export function parseResumePageState(
  params: Readonly<Record<string, string | string[] | undefined>>,
): ResumePageState {
  if (single(params["edit"]) !== "resume") return { kind: "view" };

  const from = single(params["from"]);

  if (from === undefined) return { kind: "edit", source: { kind: "current" } };
  if (from === "profile") return { kind: "edit", source: { kind: "profile" } };

  const versionId = versionIdSchema.safeParse(from);

  if (!versionId.success) return { kind: "version-gone" };

  return {
    kind: "edit",
    source: { kind: "version", versionId: versionId.data },
  };
}
