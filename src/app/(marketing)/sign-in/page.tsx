import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";

import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import { signInErrorSentence } from "@/features/auth/copy";
import {
  SignInWithGitHubForm,
  SignInWithGoogleForm,
} from "@/features/auth/provider-forms";
import { EntryHeader } from "@/features/entry-page/entry-header";
import { LegalAcceptanceLine } from "@/features/legal/acceptance-line";
import { landingPathFor } from "@/lib/landing-rule";
import { attempt, isFailure } from "@/lib/result";
import { parseReturnPath } from "@/lib/return-path";
import { createClient } from "@/lib/supabase/server";

/**
 * The sign in page (spec 0007 AC-5, AC-7, AC-12; spec 0008 AC-13, AC-20, AC-24).
 *
 * A REAL PAGE IN EVERY ENVIRONMENT. It used to render the development only
 * password form and hard 404 outside development. Feature 7 deletes that whole
 * path rather than switching it off, so no environment is one variable away from
 * accepting a password (invariant 1).
 *
 * NOTHING BELOW THIS FILE CROSSES THE CLIENT BOUNDARY. The provider controls are
 * form submits and the error line is server rendered, so this page ships zero
 * client JavaScript, the same contract spec 0006 AC-4 holds the entry page to.
 *
 * IT COMPOSES ITS OWN HEADER, with an empty navigation slot (spec 0008, AC-3a,
 * AC-5a). A marketing layout could not do it: a layout never learns the
 * pathname, and this page must not render the entry page's in page anchors,
 * whose targets do not exist here.
 */
export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in">) {
  /**
   * AC-7: the value is untrusted, so it is parsed against the closed enum at
   * this boundary. An unrecognised value renders the one generic sentence and is
   * never echoed back onto the page.
   */
  const { error, next } = await searchParams;

  /**
   * SPEC 0008, AC-13. Parsed at this boundary too, and the accepted value is the
   * only thing that reaches the page. A rejected value is dropped and never
   * echoed into a hidden field, because echoing it would hand an attacker a
   * page that carries their own string back into a form.
   */
  const returnPath = parseReturnPath(
    typeof next === "string" ? next : undefined,
  );

  const destination = await bounceDestination(error, returnPath);

  /**
   * AC-24a: OUTSIDE the span that decided it. `redirect()` works by throwing, so
   * a call inside would record the decision as having failed when it succeeded.
   */
  if (destination !== undefined) redirect(destination);

  const sentence = signInErrorSentence(error);

  return (
    <>
      <EntryHeader navigation="none" />

      <main className="flex-1">
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
            <SignInWithGoogleForm next={returnPath} />
            <SignInWithGitHubForm next={returnPath} />
          </div>

          {/*
           * SPEC 0009, AC-19: BELOW BOTH FORMS, not above them. The error line
           * sits above because five of its six sentences say "below"; this one
           * is about what pressing either control commits you to, so it reads
           * after the controls rather than before them.
           *
           * Two plain anchors and no checkbox, so the page still ships zero
           * client JavaScript.
           */}
          <div className="mt-6">
            <LegalAcceptanceLine />
          </div>
        </Section>
      </main>
    </>
  );
}

/**
 * Where an already signed in visitor should be sent instead, or `undefined` to
 * render the page (spec 0008, AC-20, AC-17a, AC-24).
 *
 * WHY THIS PAGE READS THE SESSION AT ALL. Showing provider buttons to somebody
 * who is already signed in is the same dishonesty on `/sign-in` that AC-18
 * removes from `/`. Spec 0007's security model said this page read nothing; that
 * line is superseded here, deliberately, and `/` is unchanged.
 *
 * AN ERRORED READ MEANS DO NOT BOUNCE, and the asymmetry with `/go` is the
 * reason this is written down rather than inferred. At the door an errored read
 * sends the visitor here, because running the landing rule for a caller whose
 * identity was never confirmed is the one outcome to avoid. Here, treating an
 * error as signed in would throw a genuinely signed out visitor off the only
 * page that lets them sign in, so nobody could authenticate until the error
 * cleared. Both routes fail toward showing the sign in surface.
 *
 * @param error The raw `error` query value. Its presence suppresses the bounce.
 * @param returnPath An already validated return path, or `undefined`.
 */
async function bounceDestination(
  error: string | string[] | undefined,
  returnPath: string | undefined,
): Promise<string | undefined> {
  /**
   * BINDING RULE 4: the span opens as the FIRST statement of the operation, and
   * the operation is "decide whether to bounce", not "render `/sign-in`". It
   * wraps the session read as well as the decision, so a failing read is inside
   * the denominator rather than outside it. Registered in
   * `docs/observability/spans.md`.
   */
  return Sentry.startSpan(
    { name: "sign_in.bounce", op: "function" },
    async (): Promise<string | undefined> => {
      /**
       * AC-20: no bounce when there is a message to show. `signInErrorPath()`
       * sends a failed callback here, and bouncing would discard the sentence
       * the person needs to read, leaving them back where they started with no
       * idea why.
       */
      if (error !== undefined) return undefined;

      const supabase = await createClient();

      /** BINDING RULE 5: `getClaims()` reaches the JWKS endpoint and can throw. */
      const attempted = await attempt(
        {
          kind: "external_service_failed",
          message: "Could not verify the session on the sign in page.",
        },
        () => supabase.auth.getClaims(),
      );

      /** AC-17a: an errored read is a third state. Render the page. */
      if (isFailure(attempted)) return undefined;

      const { data, error: claimsError } = attempted.value;

      /** Signed out, the ordinary case: render the page. */
      if (claimsError || !data) return undefined;

      /**
       * A valid deep link beats the landing rule, so the bounce that exists to
       * help this visitor does not throw away the link that brought them here.
       */
      return returnPath ?? (await landingPathFor(data.claims.sub));
    },
  );
}
