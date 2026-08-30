import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import { signInErrorSentence } from "@/features/auth/copy";
import { SignInWithGoogleForm } from "@/features/auth/provider-forms";

/**
 * The sign in page (spec 0007, AC-5, AC-7, AC-12).
 *
 * A REAL PAGE IN EVERY ENVIRONMENT. It used to render the development only
 * password form and hard 404 outside development. Feature 7 deletes that
 * whole path rather than switching it off, so no environment is one variable
 * away from accepting a password (invariant 1).
 *
 * NO `"use client"` ANYWHERE BELOW THIS FILE. The provider controls are form
 * submits and the error line is server rendered, so this page ships zero client
 * JavaScript, the same contract spec 0006 AC-4 holds the entry page to.
 */
export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  /**
   * AC-7: the value is untrusted, so it is parsed against the closed enum at
   * this boundary. An unrecognised value renders the one generic sentence and
   * is never echoed back onto the page.
   */
  const { error } = await searchParams;
  const sentence = signInErrorSentence(error);

  return (
    <main>
      <Section weight="standard">
        <Heading level={1}>Sign in</Heading>

        <Text className="mt-3">
          JobHunt uses your Google or GitHub account. No password to remember,
          and no email to verify.
        </Text>

        {/*
         * AC-5: THE ERROR LINE RENDERS ABOVE BOTH PROVIDER FORMS, and the
         * position is part of the criterion rather than a layout preference.
         * Five of the six sentences say "below" or "from here", so they are
         * simply wrong anywhere else on the page.
         *
         * `role="alert"` matches how this product renders every other failure
         * it shows (the health page's two), so a failure always looks like a
         * failure rather than like ordinary copy.
         */}
        {sentence === undefined ? undefined : (
          <div role="alert" className="mt-8 border-l-4 border-red-700 pl-4">
            <Text>{sentence}</Text>
          </div>
        )}

        <div className="mt-8 flex flex-col items-start gap-3">
          <SignInWithGoogleForm />
        </div>
      </Section>
    </main>
  );
}
