/**
 * What `saveResumeVersion()` hands back to the editor (spec 0024, Feature
 * design, "Editor state").
 *
 * ITS OWN TYPE, NOT `src/features/profile/form-state.ts`'s `ActionState`.
 * Folder by feature: the two features share no state module even though the
 * shapes rhyme, and this one carries a third status the profile has no use for.
 *
 * IT CARRIES WHAT THE READER TYPED BACK, which is not a convenience. With
 * JavaScript off the editor is re-rendered from scratch on the server, so the
 * action's return value is the only thing that can put 20000 characters back
 * after a refused save (AC-3).
 *
 * NOTHING IS RETURNED ON SUCCESS. The action redirects to `/resume`, so a
 * success status would be a state nothing ever renders.
 *
 * Plain strings and numbers only, so it crosses the server to client boundary
 * as data with no reviver.
 */
export interface ResumeSaveState {
  /**
   * `idle` before any submit, `failed` for a refused save, `conflict` for the
   * AC-9 version conflict, which is a named outcome and never a `Failure`.
   */
  readonly status: "idle" | "failed" | "conflict";
  /**
   * The whole form sentence, above the field: `COPY-30` to `COPY-33`.
   * `undefined` when the only message belongs to the field, and always on a
   * conflict, whose sentence (`COPY-7`) the editor builds from the number.
   */
  readonly message?: string;
  /** One message per field, keyed by the `FormData` key. Only `content` today. */
  readonly errors: Readonly<Record<string, string>>;
  /** The submitted `content`, echoed back on every outcome that is not a redirect. */
  readonly values: Readonly<Record<string, string>>;
  /** The newer version's number, present only when `status` is `conflict`. */
  readonly currentVersionNumber?: number;
  /**
   * The newer version's raw stored text, present only when `status` is
   * `conflict`. Shown read only and never rendered, so the comparison is
   * markdown to markdown and the renderer never has to reach a client component.
   */
  readonly currentVersionContent?: string;
}

/** The state the editor starts in, before anything has been submitted. */
export const IDLE_RESUME_STATE: ResumeSaveState = {
  status: "idle",
  errors: {},
  values: {},
};

/**
 * The submitted `content`, for echoing back.
 *
 * ONLY `content`, never every `FormData` entry. The hidden
 * `previousVersionNumber` is rendered from the editor's own props or from a
 * conflict's `currentVersionNumber`, never from what was submitted, so echoing
 * it would offer a second source for a value AC-9 says has exactly one.
 */
export function echoedContent(
  formData: FormData,
): Readonly<Record<string, string>> {
  const content = formData.get("content");

  return typeof content === "string" ? { content } : {};
}
