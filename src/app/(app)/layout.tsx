import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { RETURN_PATH_HEADER, parseReturnPath } from "@/lib/return-path";
import { createClient } from "@/lib/supabase/server";

/**
 * The protected layout. Everything under the `(app)` group requires a session.
 *
 * BINDING RULE 6: this is where the session is verified, not in `proxy.ts`. The
 * proxy only refreshes the cookie and echoes the requested path. Row level
 * security in Postgres is the real guarantee behind this check, and every Server
 * Action verifies its own caller again independently, because an action is a
 * callable endpoint whatever page renders it.
 *
 * IT COMPOSES NO HEADER, AND THAT IS A DECISION RATHER THAN AN OMISSION (spec
 * 0008, AC-3a and AC-5, resolved by the engineer on 2026-08-31). Each route
 * under this group renders `AppHeader` itself and passes its own
 * `aria-current="page"`, because a layout never learns the pathname and so could
 * never be told which page it is on. See `src/features/app-shell/app-header.tsx`
 * for the whole reasoning; AC-3a is owed a dated amendment.
 *
 * SIGNED IN ROUTES ARE UNINDEXED BY INHERITANCE, NOT BY ACCIDENT (AC-23). The
 * root layout at `src/app/layout.tsx` already sets
 * `robots: { index: false, follow: false }`, and every route under this group
 * inherits it. It is recorded here as chosen, because nothing in this file would
 * otherwise show that anybody thought about it.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();

  // `getClaims` verifies the token rather than trusting the cookie's contents.
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data) {
    // Visible, not silent. An unauthenticated request lands on the sign in page
    // rather than rendering an empty page that reads as success.
    redirect(await signInPathWithReturn());
  }

  return children;
}

/**
 * `/sign-in`, carrying where this visitor was actually trying to go (AC-11).
 *
 * READ ONLY AT THE MOMENT OF THE REDIRECT, which is the whole reason the proxy
 * sets the header on every request rather than the layout recording one. A
 * hovered navigation link prefetches, and a prefetch that recorded a return path
 * would overwrite the real one. Capturing it here means only a real turned away
 * visitor produces a value.
 *
 * PERCENT ENCODED, so a nested query string survives intact: `/search?q=react`
 * has to arrive at `/sign-in` as one parameter value, not as a second parameter.
 * `URLSearchParams` does that encoding, so nothing here hand rolls it.
 *
 * The header is absent on any request the proxy's matcher skips, and when the
 * path was over the shared length cap. Both fall through to a bare `/sign-in`
 * and nothing fails: the visitor signs in and the landing rule decides.
 */
async function signInPathWithReturn(): Promise<string> {
  const requestHeaders = await headers();

  /**
   * Parsed here even though the proxy set it, because the value crosses a
   * boundary and this project parses at every boundary. The proxy overwrites any
   * client supplied header of this name, so what arrives is this application's
   * own value, and it is still checked rather than assumed.
   */
  const returnPath = parseReturnPath(requestHeaders.get(RETURN_PATH_HEADER));

  if (returnPath === undefined) return "/sign-in";

  return `/sign-in?${new URLSearchParams({ next: returnPath }).toString()}`;
}
