import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 0002, "Configuration required", AC-13 and AC-14.
 *
 * The environment contract is the one guard that runs before any code does. Its
 * whole promise is that a missing or malformed variable FAILS BY NAME at build
 * time rather than surfacing later as a confusing runtime error, so these tests
 * check the name reaches a human, not merely that something threw.
 *
 * NOTHING HERE IS MOCKED, following `test/helpers/admin.test.ts`. `vi.stubEnv`
 * changes the real variable, the module is genuinely re-imported, and
 * `@t3-oss/env-nextjs` re-parses for real.
 */

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

interface ContractResult {
  /** Whether the environment parsed at all. */
  readonly valid: boolean;
  /** The variable names the failure actually named, in the order reported. */
  readonly named: readonly string[];
}

/**
 * Reads the variable names out of the issues env core reports.
 *
 * The thrown error says only "Invalid environment variables". The NAMES, which
 * are the entire diagnostic value, go to `console.error` as an array of Zod
 * issues alongside it, so that is what is captured here. A contract that failed
 * without naming anything would leave someone reading a deployment log with
 * nothing to act on.
 */
async function parseEnvironment(): Promise<ContractResult> {
  const issues: unknown[] = [];

  const reported = vi
    .spyOn(console, "error")
    .mockImplementation((...args: readonly unknown[]) => {
      for (const arg of args) {
        if (Array.isArray(arg)) issues.push(...arg);
      }
    });

  try {
    await import("./env");

    return { valid: true, named: [] };
  } catch {
    return { valid: false, named: namesIn(issues) };
  } finally {
    reported.mockRestore();
  }
}

/** The leading path segment of each reported issue, which is the variable. */
function namesIn(issues: readonly unknown[]): readonly string[] {
  const named: string[] = [];

  for (const issue of issues) {
    if (typeof issue !== "object" || issue === null || !("path" in issue)) {
      continue;
    }

    const { path } = issue;

    if (Array.isArray(path) && typeof path[0] === "string") named.push(path[0]);
  }

  return named;
}

/** Loads the parsed contract, for the cases that are expected to succeed. */
async function loadEnv() {
  const { env } = await import("./env");

  return env;
}

describe("a deployed build must carry error reporting (AC-13)", () => {
  it("refuses a deployment with no Sentry DSN, naming both of them", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    vi.stubEnv("SENTRY_DSN", undefined);
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", undefined);

    const result = await parseEnvironment();

    /**
     * THE FAILURE SHAPE THIS EXISTS TO PREVENT: without the conditional
     * requirement, a deploy with no DSN succeeds, ships with reporting
     * switched off, and leaves AC-13 passing on paper while nothing reports.
     * Silent absence of error reporting is the one failure the error model
     * cannot itself catch, because the thing that would report it is what is
     * missing.
     */
    expect(result.valid).toBe(false);
    expect(result.named).toContain("SENTRY_DSN");
    expect(result.named).toContain("NEXT_PUBLIC_SENTRY_DSN");
  });

  it("accepts local work with no Sentry project at all", async () => {
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", undefined);
    vi.stubEnv("SENTRY_DSN", undefined);
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", undefined);

    const result = await parseEnvironment();

    /**
     * The half that makes the test above mean something. If the DSNs were
     * simply required always, the first test would pass while a fresh clone
     * could not run at all before anyone had made a Sentry project.
     */
    expect(result.valid).toBe(true);
  });
});

describe("the contract fails by name", () => {
  it("refuses a missing secret key, naming it", async () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined);

    const result = await parseEnvironment();

    expect(result.valid).toBe(false);
    expect(result.named).toContain("SUPABASE_SECRET_KEY");
  });

  it("treats an empty value as absent rather than as a value", async () => {
    // An empty string in a `.env` file means "not set", not "set to nothing".
    // Without this a blank line in a dashboard reads as a configured key and
    // fails much later, at the first query, as an authentication error.
    vi.stubEnv("SUPABASE_SECRET_KEY", "");

    const result = await parseEnvironment();

    expect(result.valid).toBe(false);
    expect(result.named).toContain("SUPABASE_SECRET_KEY");
  });
});

describe("trace sampling comes from validated configuration (AC-14)", () => {
  it("defaults to 1, which is what the failure rate alert needs", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", undefined);

    const env = await loadEnv();

    /**
     * Binding rule 4's alert divides failures by total spans, so a sample rate
     * below 1 where the alert runs silently shrinks the denominator. The
     * default has to be the safe end, not the cheap end.
     */
    expect(env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE).toBe(1);
  });

  it("reads a valid rate rather than ignoring it", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", "0.25");

    const env = await loadEnv();

    // Coerced from the string every environment variable actually is.
    expect(env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE).toBe(0.25);
  });

  it("refuses a rate outside 0 to 1, naming it", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", "2");

    const result = await parseEnvironment();

    expect(result.valid).toBe(false);
    expect(result.named).toContain("NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE");
  });
});

describe("the CI escape hatch (invariant 2)", () => {
  it("lets a build with no secrets through when SKIP_ENV_VALIDATION is set", async () => {
    vi.stubEnv("SKIP_ENV_VALIDATION", "true");
    vi.stubEnv("SUPABASE_SECRET_KEY", undefined);

    const result = await parseEnvironment();

    /**
     * This exists for the CI job that holds no Supabase keys, and nowhere else.
     * A deployed build must never set it, which is a rule CI and the deploy
     * configuration carry rather than something this test can check. What it
     * can check is that the hatch works, because `pnpm build` in CI depends on
     * it and a regression here breaks every pull request at once.
     */
    expect(result.valid).toBe(true);
  });
});
