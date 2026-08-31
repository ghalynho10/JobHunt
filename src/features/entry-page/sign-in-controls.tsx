import {
  SignInWithGitHubForm,
  SignInWithGoogleForm,
} from "@/features/auth/provider-forms";

/**
 * The two provider controls (spec 0006 AC-6, superseded AC-7, and spec 0007
 * AC-16).
 *
 * THESE ARE REAL SUBMITS NOW, AND THE HISTORY IS WORTH KEEPING. Until feature 7
 * this module rendered two LABELS, not controls, with a `Chip state="status"`
 * reading "soon" and a line saying accounts were not open yet. That was the
 * right call for exactly as long as sign in did not work: the prototype had
 * pointed both providers at `#`, which is a control that looks live, takes
 * focus, and does nothing.
 *
 * Feature 7 makes sign in real, which makes the whole premise false rather than
 * merely dated. Spec 0006 AC-7 is superseded by spec 0007 AC-16 for that
 * reason, and its `COPY-1` and both chips are deleted here rather than reworded,
 * because they were false for every visitor the moment this shipped.
 *
 * WHAT SURVIVES UNTOUCHED is spec 0006's one rule with no exceptions: nothing
 * that cannot work is a link. The inert apply control on the hero card
 * (AC-17) still has nothing real to apply to and is still not a link, and the
 * page level test still holds that half.
 *
 * The forms themselves live in `src/features/auth/`, because they belong to the
 * auth feature and this page is one of two places that render them. Nothing here
 * crosses the client boundary, so the entry page still ships zero client
 * JavaScript (spec 0006, AC-4).
 *
 * THE `tone` PROP IS GONE, along with the light and dark colour split it fed.
 * That split existed for the text labels: `--muted` measures about 2.2:1 on
 * `--primary-800`, well under the AA floor, so the dark variant lifted the note
 * to `--primary-300` (spec 0006, AC-14). `Button variant="secondary"` carries
 * its own surface and ink and so reads identically on either ground, and the
 * note those colours were for no longer exists. A prop that branches on nothing
 * is worse than no prop, so it is deleted rather than left as decoration.
 */

/** The sign in cluster: both provider forms, side by side where there is room. */
export function SignInControls() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SignInWithGoogleForm />
      <SignInWithGitHubForm />
    </div>
  );
}
