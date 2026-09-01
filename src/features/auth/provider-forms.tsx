import { Button } from "@/components/ui/button";
import { GitHubIcon, GoogleIcon } from "@/components/ui/icons";
import { RETURN_PATH_FIELD } from "@/lib/return-path";

import { signInWithGitHub, signInWithGoogle } from "./actions";

/**
 * The provider controls, as real form submits (spec 0007, AC-2, AC-16).
 *
 * A PLAIN `<form action={...}>`, NOT A CLICK HANDLER. Nothing here crosses the
 * client boundary, so every page that renders these still ships zero client
 * JavaScript and the controls work with JavaScript switched off. That is what
 * keeps spec 0006 AC-4 true after this feature lands.
 *
 * ONE EXPORT PER PROVIDER, mirroring the two thin actions behind them. The set
 * is closed at two and the provider is never a value read from the form, so
 * there is no untrusted input on this path at all.
 *
 * The mark is decorative and carries `aria-hidden` from the icon set itself.
 * The button's own text is the accessible name, so it needs no `label`.
 *
 * THE HIDDEN FIELD IS HOW THE DEEP LINK REACHES THE ACTION (spec 0008, AC-13).
 * It renders only when the page accepted one, so a form with nothing to carry
 * ships no empty field. The value has already been validated at the page
 * boundary, and the action validates it again on the way out, because a Server
 * Action is a callable endpoint whatever page renders it.
 */

interface ProviderFormProps {
  /**
   * An ALREADY VALIDATED return path, or `undefined`. Callers pass the output of
   * `parseReturnPath()`, never a raw query value: a rejected value must never be
   * echoed onto the page.
   */
  readonly next?: string;
}

/**
 * The hidden field, or nothing at all.
 *
 * Shared by both forms so the two cannot drift into carrying different fields,
 * which would show up as one provider honouring a deep link and the other
 * quietly dropping it.
 */
function ReturnPathField({ next }: ProviderFormProps) {
  if (next === undefined) return undefined;

  return <input type="hidden" name={RETURN_PATH_FIELD} value={next} />;
}
export function SignInWithGoogleForm({ next }: ProviderFormProps) {
  return (
    <form action={signInWithGoogle}>
      <ReturnPathField next={next} />
      <Button type="submit" variant="secondary">
        <GoogleIcon />
        Sign in with Google
      </Button>
    </form>
  );
}

/**
 * GitHub. Identical in shape to Google on purpose: the two differ only in which
 * action they post to, which is what keeps the "two thin actions" split honest
 * rather than reintroducing a provider argument through the back door.
 */
export function SignInWithGitHubForm({ next }: ProviderFormProps) {
  return (
    <form action={signInWithGitHub}>
      <ReturnPathField next={next} />
      <Button type="submit" variant="secondary">
        <GitHubIcon />
        Sign in with GitHub
      </Button>
    </form>
  );
}
