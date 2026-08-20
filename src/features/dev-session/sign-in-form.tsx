"use client";

import { useActionState } from "react";

import { signInWithDevPassword, type SignInState } from "./actions";

/**
 * Unstyled on purpose. Feature 5 brings the design tokens and the base
 * components, and feature 7 replaces this form with the real OAuth buttons.
 * Every control still carries a real label and a visible focus state, because
 * the accessibility floor applies from the first screen.
 */
export function SignInForm() {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    signInWithDevPassword,
    null,
  );

  return (
    <form action={formAction} className="flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="border px-2 py-1"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="border px-2 py-1"
        />
      </div>

      {/* The failure is shown, never swallowed into a page that looks fine. */}
      {state?.error ? (
        <p role="alert" className="text-red-700">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="border px-3 py-1">
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
