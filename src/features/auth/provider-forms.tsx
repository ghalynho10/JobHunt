import { Button } from "@/components/ui/button";
import { GitHubIcon, GoogleIcon } from "@/components/ui/icons";

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
 */
export function SignInWithGoogleForm() {
  return (
    <form action={signInWithGoogle}>
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
export function SignInWithGitHubForm() {
  return (
    <form action={signInWithGitHub}>
      <Button type="submit" variant="secondary">
        <GitHubIcon />
        Sign in with GitHub
      </Button>
    </form>
  );
}
