import type { ReactNode } from "react";

import { Chip } from "@/components/ui/chip";
import { GitHubIcon, GoogleIcon } from "@/components/ui/icons";
import { Text } from "@/components/ui/text";

/**
 * The two provider controls, and the line that says why they do not act
 * (spec 0006, AC-7).
 *
 * NOTHING HERE IS A LINK OR A BUTTON, AND THAT IS THE WHOLE POINT. The
 * prototype pointed both providers at `#`, which is a control that looks live,
 * takes focus, and does nothing. Feature 7 builds real OAuth; until then the
 * page states the position instead of miming it. AC-7 is deliberately
 * environment independent: this holds locally, on preview and in production
 * alike, because the page never links to `/sign-in` at all.
 *
 * `Button` cannot express this and must not be bent into it. Its own type union
 * forbids a disabled link precisely because HTML has none, and its guidance for
 * a control the reader cannot follow is exactly what this module does: render
 * the label as `Text` and say why it is unavailable.
 *
 * ONE COMPONENT, TWO GROUNDS. It renders in the hero on paper and again in the
 * dark sign in band, so `tone` swaps only the colours that would otherwise fall
 * below AA on `--primary-800`: `--muted` is 2.2:1 there, `--primary-300` is
 * 6.9:1. Nothing else changes between the two, per AC-6.
 */

/** `COPY-1` (spec 0006), written by the engineer and used verbatim. */
const SIGN_IN_NOTE =
  "Sign in isn't live yet. Coming soon with Google and GitHub.";

type Tone = "light" | "dark";

type ProviderLabelProps = {
  readonly icon: ReactNode;
  readonly children: ReactNode;
  readonly tone: Tone;
};

/**
 * One provider, as a label. The status chip carries the state in words, so it
 * survives colour vision differences and a forced palette alike.
 *
 * The wrapper sets the text colour rather than the label doing it, because the
 * GitHub mark draws in `currentColor` and has to follow the ground it sits on.
 * The Google mark keeps its own four colours either way, which its own doc
 * comment in the icon set explains.
 */
function ProviderLabel({ icon, children, tone }: ProviderLabelProps) {
  const isDark = tone === "dark";

  return (
    <span
      className={`inline-flex items-center gap-2.5 ${isDark ? "text-paper" : "text-ink"}`}
    >
      {icon}
      <Text as="span" className={isDark ? "text-paper" : "text-ink"}>
        {children}
      </Text>
      <Chip
        state="status"
        className={
          isDark ? "border-primary-300/50 text-primary-300" : undefined
        }
      >
        soon
      </Chip>
    </span>
  );
}

type SignInControlsProps = {
  /** `dark` is the sign in band on `--primary-800`. Defaults to `light`. */
  readonly tone?: Tone;
};

/**
 * The sign in cluster: both provider labels, then the line saying accounts are
 * not open yet.
 */
export function SignInControls({ tone = "light" }: SignInControlsProps) {
  return (
    <div className="flex flex-col items-start gap-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <ProviderLabel icon={<GoogleIcon />} tone={tone}>
          Sign in with Google
        </ProviderLabel>
        <ProviderLabel icon={<GitHubIcon />} tone={tone}>
          Sign in with GitHub
        </ProviderLabel>
      </div>

      <Text
        variant="muted"
        className={tone === "dark" ? "text-primary-300" : undefined}
      >
        {SIGN_IN_NOTE}
      </Text>
    </div>
  );
}
