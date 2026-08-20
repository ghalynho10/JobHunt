import { notFound } from "next/navigation";

import { SignInForm } from "@/features/dev-session/sign-in-form";

/**
 * The development only sign in. Spec 0001 decided OAuth only (Google and GitHub)
 * for the real product, and feature 7 builds it. This page exists so the
 * scaffold can prove a protected read under a real session, and feature 7
 * replaces it.
 */
export default function SignInPage() {
  // Blocked in two places, not one: the page refuses to render outside
  // development, and the Server Action refuses to run there as well. A page
  // guard alone would leave the action callable on its own.
  if (process.env.NODE_ENV !== "development") {
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
