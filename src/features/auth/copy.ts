import { authErrorCodeSchema, type AuthErrorCode } from "./failure-codes";

/**
 * The sign in page's sentences (spec 0007, `## Copy`).
 *
 * WRITTEN BY THE ENGINEER, USED VERBATIM. Every string below is copied
 * character for character from the spec's `## Copy` table. The spec says in
 * terms that `/develop` must not invent or reword any of them, so a change here
 * is a spec change first, not an edit.
 *
 * NO EM DASH, NO EN DASH, NO SEMICOLON, in any of them. That is the spec's own
 * rule for this block and it has a reason: this is the only text a user
 * actually reads, and em dash overuse is one of the most cited markers of
 * machine written text, which costs something real on a portfolio facing
 * product. All five use full stops, with a single comma in `COPY-5`.
 *
 * THREE CONSTRAINTS THESE STRINGS PUT ON THE PAGE, not notes about tone:
 *
 * 1. `COPY-4`'s "Start again from here. An older tab or link won't work." is
 *    AC-4's fix in plain words. Restarting from this page is exactly what
 *    resolves the host only PKCE cookie case, on a per commit preview URL or on
 *    the old production host. The clause is load bearing and must not be
 *    trimmed for brevity.
 * 2. Every "below" assumes the error line renders ABOVE the two provider forms.
 *    AC-5 carries that so it is checkable rather than only documented.
 * 3. `COPY-3`, `COPY-4` and `COPY-6` all say "start again" and that repetition
 *    is deliberate. The action genuinely is the same and only the first
 *    sentence differs, so do not improve them into artificial variety.
 */

/** `COPY-6`. Shown for any `error` value outside the enum, and never echoing it. */
const GENERIC_SENTENCE =
  "Something went wrong signing you in. Please start again below.";

/**
 * `COPY-2` IS NOT WRITTEN YET, and this is the placeholder the spec's build
 * plan calls for.
 *
 * The spec leaves the slot empty until milestone 4 because its content depends
 * on P10: whether a hook rejection reaches this application on the callback at
 * all, or is answered from GoTrue's own endpoint. `account_exists` cannot be
 * raised before the hook exists, so this entry is unreachable until then, and
 * the generic sentence stands in rather than a sentence invented here.
 *
 * REPLACE THIS WITH THE ENGINEER'S OWN `COPY-2` AT MILESTONE 4. The map below
 * is typed over every member of the enum, so the slot cannot simply be dropped.
 */
const COPY_2_PENDING = GENERIC_SENTENCE;

const SENTENCES: Readonly<Record<AuthErrorCode, string>> = {
  /** `COPY-1`. */
  access_denied:
    "You cancelled before signing in. Nothing changed. Pick an option below when you're ready.",
  /** `COPY-2`, pending. See the note above. */
  account_exists: COPY_2_PENDING,
  /** `COPY-3`. */
  no_code: "Something was missing from that link. Start again below.",
  /** `COPY-4`. */
  exchange_failed:
    "We couldn't finish signing you in. Start again from here. An older tab or link won't work.",
  /** `COPY-5`. */
  provider_unavailable:
    "That provider isn't responding right now. Try the other option, or try again shortly.",
};

/**
 * The sentence to render for a raw `error` query value, or `undefined` when
 * there is nothing to say (AC-5, AC-7).
 *
 * The parse is the boundary: an unrecognised value never reaches the page as
 * itself, it reaches it as `COPY-6`. A missing value means the page was opened
 * normally and renders no error line at all, which is not the same thing as a
 * failure with an empty sentence.
 *
 * The parameter is typed the way `searchParams` actually arrives, including the
 * array case a repeated query parameter produces (`?error=a&error=b`). That
 * case is a malformed request, so it takes the generic sentence rather than
 * quietly reading the first member.
 */
export function signInErrorSentence(
  raw: string | readonly string[] | undefined,
): string | undefined {
  if (raw === undefined) return undefined;

  const parsed = authErrorCodeSchema.safeParse(raw);

  return parsed.success ? SENTENCES[parsed.data] : GENERIC_SENTENCE;
}
