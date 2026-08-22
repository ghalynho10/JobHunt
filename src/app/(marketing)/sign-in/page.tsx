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
   */
  if (!env.DEV_SESSION_ENABLED) {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <p>
        Development only. Seeded users are <code>dev-one@example.test</code> and{" "}
        <code>dev-two@example.test</code>, both with the password{" "}
        <code>devpassword123</code>. Sign in as each in turn: they must see
        different rows.
      </p>
      <SignInForm />
    </main>
  );
}
