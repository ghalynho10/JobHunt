import { notFound } from "next/navigation";

import { env } from "@/env";
import { SignInForm } from "@/features/dev-session/sign-in-form";

/**
 * The development only sign in. Spec 0001 decided OAuth only (Google and GitHub)
 * for the real product, and feature 7 builds it. This page exists so the
 * scaffold can prove a protected read under a real session, and feature 7
 * replaces it.
 */
export default function SignInPage() {
  /**
   * Spec 0002 AC-10: blocked in two places, not one. This page refuses to
   * render, and the Server Action behind it refuses to run, each checking the
   * same validated variable independently. A page guard alone would leave the
   * action callable on its own, and an action guard alone would leave this page
   * returning a not found on every preview, which is where the end to end
   * thread has to be proved.
   *
   * The variable defaults to false, so production, which never sets it, is
   * blocked by absence rather than by a label a build tool chooses.
   *
   * The two guards run at different times, which is worth knowing before
   * testing either. This page is statically prerendered, so its guard is settled
   * for each environment when that environment is built, and the route becomes a
   * hard 404 on production. The Server Action's guard runs per request. Both are
   * closed on production; only the action reacts to a variable changed after a
   * deploy, so proving this half locally means rebuilding without the variable,
   * not just restarting.
   */
  if (!env.DEV_SESSION_ENABLED) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p>
        Development only. Seeded users are <code>dev-one@example.test</code>,{" "}
        <code>dev-two@example.test</code> and{" "}
        <code>dev-three@example.test</code>, all with the password{" "}
        <code>devpassword123</code>. Sign in as each in turn: the first two must
        see different profiles, and the third, who has no profile row on
        purpose, must see a named failure rather than an empty page (spec 0003,
        AC-3 and AC-14).
      </p>
      <SignInForm />
    </main>
  );
}
