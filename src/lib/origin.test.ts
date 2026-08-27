import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0002, "Site URL: two values, two jobs".
 *
 * Two URL values that are EQUAL IN PRODUCTION AND DIFFER EVERYWHERE ELSE, which
 * is exactly why one silently standing in for the other would look correct on
 * the one environment anybody checks. `canonicalSiteUrl` is always production;
 * `currentOrigin()` is wherever this request is actually being served from.
 *
 * NOTHING HERE IS MOCKED, following `test/helpers/admin.test.ts`. `vi.stubEnv`
 * changes the real variable and the modules are genuinely re-imported, so
 * `src/env.ts` re-parses the real environment and `origin.ts` reads a real `env`
 * object. Stubbing the module would be a mock encoding the same assumption as
 * the code under test.
 */

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

/** The production origin, stubbed so these tests do not depend on `.env.test`. */
const CANONICAL = "https://usejobhunt.vercel.app";

/**
 * Re-imports the module against whatever the environment currently says.
 * `vi.resetModules()` above is what makes this a fresh parse rather than the
 * cached module `.env.test` already produced.
 *
 * The two Sentry DSNs are supplied because AC-13 makes them REQUIRED the moment
 * `NEXT_PUBLIC_VERCEL_ENV` is set, which every case below does. Without them the
 * contract refuses to parse and these tests fail for a reason that has nothing
 * to do with origins. That conditional requirement is real behaviour and is
 * proved on purpose in `src/env.test.ts`; here it is only a precondition.
 */
async function loadOrigin() {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", CANONICAL);
  vi.stubEnv("SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");
  vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://key@o1.ingest.sentry.io/1");

  return import("./origin");
}

describe("currentOrigin() resolves the origin actually serving the request", () => {
  it("uses the branch URL on a preview deployment", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    vi.stubEnv(
      "NEXT_PUBLIC_VERCEL_BRANCH_URL",
      "jobhunt-git-feat-x.vercel.app",
    );

    const { currentOrigin } = await loadOrigin();

    /**
     * Vercel's value carries no protocol scheme, so the module adds one. A
     * regression here is an OAuth callback pointed at a URL with no scheme,
     * which fails at the provider rather than in this codebase.
     */
    expect(currentOrigin()).toBe("https://jobhunt-git-feat-x.vercel.app");
  });

  it("throws on a preview with no branch URL rather than guessing", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_BRANCH_URL", undefined);

    const { currentOrigin } = await loadOrigin();

    /**
     * Binding rule 5 keeps a configuration bug throwing so it reaches an error
     * boundary. THE ALTERNATIVE IS THE DANGEROUS ONE: falling back to the
     * canonical URL here would point a preview's sign in redirect at
     * production, which looks like a working deployment until someone tries to
     * sign in on a branch.
     */
    expect(() => currentOrigin()).toThrow(/NEXT_PUBLIC_VERCEL_BRANCH_URL/);
  });

  it("uses the canonical site URL in production", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");

    const { currentOrigin } = await loadOrigin();

    expect(currentOrigin()).toBe(CANONICAL);
  });

  it("is localhost locally, whether Vercel labels it development or says nothing at all", async () => {
    // Two spellings of the same situation: `vercel dev` sets the label, and
    // ordinary local work sets nothing. Both are localhost, and an absent value
    // is by far the common one, so a switch handling only the label would be
    // wrong almost all the time.
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "development");
    const labelled = await loadOrigin();
    expect(labelled.currentOrigin()).toBe("http://localhost:3000");

    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", undefined);
    const unlabelled = await loadOrigin();
    expect(unlabelled.currentOrigin()).toBe("http://localhost:3000");
  });
});

describe("the two URL values cannot stand in for each other", () => {
  it("keeps the canonical URL pointing at production even when serving localhost", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", undefined);

    const { canonicalSiteUrl, currentOrigin } = await loadOrigin();

    /**
     * The invariant the whole two value split exists for, and it can only be
     * seen where the two differ. A metadata check run locally shows PRODUCTION
     * links, which is correct and looks wrong the first time. Collapsing these
     * into one value would make canonical links on a preview point at the
     * preview, quietly competing with production in search results.
     */
    expect(canonicalSiteUrl).toBe(CANONICAL);
    expect(currentOrigin()).toBe("http://localhost:3000");
    expect(canonicalSiteUrl).not.toBe(currentOrigin());
  });
});
