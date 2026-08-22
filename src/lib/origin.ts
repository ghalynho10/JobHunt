import { env } from "@/env";

/**
 * The two URL values this application has, named separately on purpose
 * (spec 0002, "Site URL: two values, two jobs").
 *
 * Neither can quietly stand in for the other. A canonical link that points at a
 * preview is wrong, and a redirect that points at production from a preview is
 * broken. They are equal in production and differ everywhere else, which is
 * exactly why one of them silently substituted for the other would look correct
 * on the one environment anybody checks.
 */

/**
 * The canonical site URL: always the production origin, in every environment,
 * including locally.
 *
 * Used for page metadata, canonical links and the social preview image
 * (feature 6). Because it is the production origin even on `localhost`, a
 * metadata check run locally shows production links. That is correct behaviour
 * and it will look wrong the first time.
 */
export const canonicalSiteUrl: string = env.NEXT_PUBLIC_SITE_URL;

/**
 * The origin this request is actually being served from.
 *
 * Used for OAuth redirect callbacks (feature 7) and any absolute link back to
 * the running deployment. On a preview that is the branch URL, in production the
 * canonical site URL, and locally `http://localhost:3000`.
 *
 * `VERCEL_URL` is deliberately not used anywhere: Vercel documents it as
 * incompatible with standard deployment protection, which is the protection
 * this project's whole environment split rests on. The branch URL is the
 * supported value, and it carries no protocol scheme, so one is added here.
 *
 * A preview with no branch URL throws rather than returning a plausible wrong
 * answer. Binding rule 5 keeps programmer and configuration bugs throwing so
 * they reach an error boundary: a redirect quietly pointed at production from a
 * preview would be a silent failure that only shows up as a broken sign in.
 */
export function currentOrigin(): string {
  switch (env.NEXT_PUBLIC_VERCEL_ENV) {
    case "preview": {
      const branchUrl = env.NEXT_PUBLIC_VERCEL_BRANCH_URL;

      if (branchUrl === undefined) {
        throw new Error(
          "NEXT_PUBLIC_VERCEL_BRANCH_URL is missing on a preview deployment. Check that system environment variables are enabled for this Vercel project.",
        );
      }

      return `https://${branchUrl}`;
    }
    case "production":
      return canonicalSiteUrl;
    /**
     * `development` is Vercel's own label for `vercel dev`, and an absent value
     * is ordinary local work. Both are localhost.
     */
    case "development":
    case undefined:
      return "http://localhost:3000";
  }
}
