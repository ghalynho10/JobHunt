import "./load-env";

/**
 * Vitest `globalSetup` for the integration project (spec 0004, AC-12).
 *
 * Runs once, before any integration test, and fails with a message that names
 * the command to fix it. Without this, a stack that is simply not running
 * surfaces as a wall of `fetch failed` errors from every test at once, and the
 * real cause (Docker is not up) is nowhere in the output.
 */

/**
 * GoTrue's own health endpoint, rather than the REST API. It is the service the
 * session mint actually depends on, it answers without a key, and it is the
 * last of the stack's containers to become ready, so an answer here means the
 * database behind it is ready too.
 */
async function stackIsUp(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/auth/v1/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function setup(): Promise<void> {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set, so there is nothing to test against. Copy .env.test.example to .env.test, then run `pnpm db:start`.",
    );
  }

  if (await stackIsUp(url)) return;

  throw new Error(
    [
      `The local Supabase stack is not answering at ${url}.`,
      "",
      "These tests run against the real stack with the real row level security",
      "policies applied, deliberately: a mock would be free to agree with a",
      "wrong assumption in the code it is meant to be checking.",
      "",
      "Start it, then run this again:",
      "",
      "  pnpm db:start",
      "",
      "It needs Docker running.",
    ].join("\n"),
  );
}
