/**
 * The shape this feature's Server Actions return (spec 0014, AC-9).
 *
 * IT CARRIES A SUCCESS STATE, AND THAT IS THE DIFFERENCE FROM THE PROFILE ONE.
 * `src/features/profile/form-state.ts` deliberately has none, and its comment
 * says why: every profile action ends in `redirect()`, so a success branch there
 * would be a state nothing could ever render.
 *
 * `recordApplication` cannot do that. Ending in `redirect()` (or in
 * `revalidatePath`) would put a re-render of `/search` into the action's
 * response, which re-runs the Adzuna search and spends one of 25 weekly calls
 * (spec 0014, AC-10). So the apply returns instead of redirecting, and the only
 * thing that can tell the card it worked is this returned value.
 *
 * WHICH IS WHY `undefined` WOULD NOT DO. `useActionState` starts at the initial
 * state, so "returned nothing" and "never submitted" would be the same value,
 * and the card could not tell a successful apply from a control nobody had
 * pressed yet. `status: "applied"` is a state the card can actually render.
 *
 * NOT OPTIMISTIC. The applied state is only ever reached by a returned
 * `"applied"`, which means the row is in the database. A card that flipped
 * before the write would show the reader an application that might not exist.
 */
export interface ApplicationActionState {
  /**
   * `idle` is the initial state, before any submit. `applied` means the row
   * landed. `failed` carries a message saying why nothing was written.
   */
  readonly status: "idle" | "applied" | "failed";
  /**
   * A whole form sentence: already applied, no profile row yet, a stale build,
   * the database unreachable. `undefined` only in `idle` and `applied`.
   */
  readonly message?: string;
  /**
   * Where to send the reader to fix it, when the message has somewhere to
   * point (`COPY-3` links to `/profile`).
   *
   * A PATH PLUS ITS LINK TEXT, NEVER MARKUP IN THE MESSAGE. Gluing an anchor
   * into the sentence would force the message to be rendered as HTML, which is
   * how a copy slot becomes an injection surface.
   */
  readonly action?: { readonly href: string; readonly label: string };
}

/** The state every control starts in, before anything has been submitted. */
export const IDLE_STATE: ApplicationActionState = { status: "idle" };

/** The row landed. Nothing to say, and the card flips on this alone. */
export const APPLIED_STATE: ApplicationActionState = { status: "applied" };

/** Nothing was written, and here is the sentence explaining that. */
export function failedState(
  message: string,
  action?: { readonly href: string; readonly label: string },
): ApplicationActionState {
  return { status: "failed", message, action };
}
