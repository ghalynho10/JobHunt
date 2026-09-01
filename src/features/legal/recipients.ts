/**
 * The third parties this app sends data to, as a typed registry (spec 0009,
 * AC-3, AC-5, AC-6).
 *
 * THE PAGE RENDERS THIS LIST; IT NEVER RESTATES IT. Invariant 1: the prose on
 * `/privacy` cannot name a company the registry does not hold, and cannot omit
 * one it does, because there is only one list. This repository has already
 * shipped the other shape once, where `hero-section.tsx` carried a written
 * count beside a list that had moved on.
 *
 * IT IS ALSO THE DRIFT GUARD (AC-5). `recipients.test.ts` reads every variable
 * name out of `src/env.ts` and fails unless each is accounted for here, either
 * as a key that reaches a recipient or as one that reaches nobody with a stated
 * reason. That is what makes features 11, 13 and 14 add themselves to this
 * notice as part of their own build rather than leaving it quietly stale.
 *
 * WHAT THE GUARD CANNOT SEE. Google's and GitHub's OAuth credentials live in
 * `supabase/config.toml` and the Supabase dashboard, never in `src/env.ts`, so
 * the test is blind to those two entries and they stay correct by review alone.
 * It is well aimed at the recipients this feature actually fears going stale,
 * which are the ones that arrive with an API key.
 */

/** One company that receives data, and what it receives. */
export interface DataRecipient {
  /** Stable key, used for the list key and by the drift test. */
  readonly id: string;
  /** The company's name, as shown on the page. */
  readonly name: string;
  /** Plain words: what this company gets. */
  readonly receives: string;
  /** Plain words: why it gets it. */
  readonly why: string;
  /**
   * The `src/env.ts` keys whose values reach this recipient.
   *
   * AN EMPTY ARRAY IS MEANINGFUL: it marks a recipient this app reaches without
   * holding a credential of its own, which is exactly Google and GitHub, whose
   * credentials Supabase holds.
   */
  readonly envKeys: readonly string[];
}

/**
 * Every third party receiving data today (AC-3).
 *
 * KNOWINGLY INCOMPLETE ON THE DAY IT SHIPS, and the incompleteness is recorded
 * rather than overlooked: Adzuna arrives at feature 11 and the model providers
 * at features 13 and 14. Each adds its own entry as part of its own build, and
 * the AC-5 test fails loudly for any that arrive with an `src/env.ts` key.
 */
export const DATA_RECIPIENTS: readonly DataRecipient[] = [
  {
    id: "supabase",
    name: "Supabase",
    receives:
      "everything listed above, since it holds both the database and the sign in records",
    why: "It is where the data is stored. Nothing about the service works without it.",
    envKeys: [
      "SUPABASE_SECRET_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ],
  },
  {
    id: "vercel",
    name: "Vercel",
    receives:
      "the IP address a request arrives from, and location data derived from it",
    why: "It serves the site, so every request reaches it before it reaches anything else.",
    envKeys: [],
  },
  {
    id: "sentry",
    name: "Sentry",
    receives:
      "error and performance events: what broke, where in the code, and how long an operation took",
    why: "It is how a failure gets noticed and fixed rather than silently affecting people.",
    envKeys: [
      "SENTRY_DSN",
      "NEXT_PUBLIC_SENTRY_DSN",
      "NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE",
      /*
       * Vercel SUPPLIES this one, and it still belongs here, which is the case
       * spec 0009's definition of "reaches" was written for. Both Sentry configs
       * pass it as `environment`, so Sentry stamps it on every event: a key that
       * arrives from one company and is sent onward to another belongs to the
       * one it is sent to. It sat in `ENV_KEYS_WITH_NO_RECIPIENT` until a cross
       * check on 2026-09-01 caught it, behind a reason that read plausibly and
       * was false.
       */
      "NEXT_PUBLIC_VERCEL_ENV",
    ],
  },
  {
    id: "google",
    name: "Google",
    receives:
      "the sign in handshake alone, and only if Google is the account chosen to sign in with",
    why: "It confirms the account belongs to the person signing in, so there is no password here to lose.",
    envKeys: [],
  },
  {
    id: "github",
    name: "GitHub",
    receives:
      "the sign in handshake alone, and only if GitHub is the account chosen to sign in with",
    why: "The same job as Google, for people who would rather use their GitHub account.",
    envKeys: [],
  },
];

/**
 * An `src/env.ts` key that carries nothing to a third party, and why.
 *
 * WHY THIS LIST EXISTS AT ALL. Spec 0009's invariant 2 says every key maps to
 * exactly one recipient entry, and three of them honestly map to none: two are
 * local switches and one is this site's own address. Forcing them under a
 * company would put a false sentence on a page whose whole point is being true,
 * so the registry classifies instead. The forcing function is unchanged: a new
 * key still fails the suite until somebody decides which side of this line it
 * falls on, and landing a key here is as visible in review as adding a
 * recipient.
 */
export interface NonRecipientEnvKey {
  readonly key: string;
  readonly why: string;
}

/** The keys that reach no third party (AC-5). */
export const ENV_KEYS_WITH_NO_RECIPIENT: readonly NonRecipientEnvKey[] = [
  {
    key: "DEV_SESSION_ENABLED",
    why: "A local switch guarding the development session mint. Nothing under src/ reads it and it leaves no request.",
  },
  {
    key: "UI_PREVIEW_ENABLED",
    why: "A local switch deciding whether the design system preview renders. It leaves no request.",
  },
  {
    key: "NEXT_PUBLIC_SITE_URL",
    why: "This site's own canonical address, used to build links. It is a destination, not a recipient.",
  },
  {
    key: "NEXT_PUBLIC_VERCEL_BRANCH_URL",
    why: "Supplied BY Vercel to the running build, for the same reason. It travels inward, and unlike NEXT_PUBLIC_VERCEL_ENV it is not sent onward to anybody.",
  },
  {
    key: "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
    why: "Declared but read nowhere under src/. Sentry does tag events with the deployed commit, but its SDK infers that from the separate unprefixed VERCEL_GIT_COMMIT_SHA, which never passes through this schema.",
  },
];
