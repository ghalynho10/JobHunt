"use server";

import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { z } from "zod";

import { failure, success, type Result } from "@/lib/result";
import { createClient } from "@/lib/supabase/server";

/**
 * A development only password sign in, built to prove the scaffold's end to end
 * thread and nothing else.
 *
 * Spec 0001 decided OAuth only (Google and GitHub) for the real product, and
 * feature 7 builds it. This exists because a protected page cannot read a row
 * under row level security without a real session, and the scaffold has to prove
 * that path works before any of the real auth work starts.
 *
 * It is hard blocked outside development. Feature 7 deletes this feature folder.
 */

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter the password."),
});

export type SignInState = { readonly error: string } | null;

export async function signInWithDevPassword(
  _previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const result = await attemptSignIn(formData);

  if (!result.ok) {
    return { error: result.message };
  }

  // Outside the span on purpose: `redirect` works by throwing, and a throw
  // inside the span would be recorded as the operation failing.
  redirect("/health");
}

async function attemptSignIn(formData: FormData): Promise<Result<null>> {
  /** BINDING RULE 4: the span opens first, before the guard clause below. */
  return Sentry.startSpan(
    { name: "dev_session.sign_in", op: "auth" },
    async (): Promise<Result<null>> => {
      if (process.env.NODE_ENV !== "development") {
        return failure({
          kind: "session_missing",
          severity: "unexpected",
          message: "Password sign in is disabled outside development.",
        });
      }

      const parsed = credentialsSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
      });

      if (!parsed.success) {
        return failure({
          kind: "validation_failed",
          severity: "expected",
          message:
            parsed.error.issues[0]?.message ?? "Check the details you entered.",
        });
      }

      const supabase = await createClient();

      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });

      if (error) {
        /**
         * Binding rule 3: the severity has to be the real one. A rejected
         * password is the system working and the answer being no. A 5xx from the
         * auth service is something broken, and reporting it at info level would
         * bury a real outage among ordinary typos.
         */
        const broken = error.status === undefined || error.status >= 500;

        return failure({
          kind: broken ? "external_service_failed" : "session_missing",
          severity: broken ? "unexpected" : "expected",
          message: broken
            ? "The sign in service is not responding."
            : "That email and password did not match.",
          context: { status: error.status },
          cause: error,
        });
      }

      return success(null);
    },
  );
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
