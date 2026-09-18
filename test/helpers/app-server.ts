import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";

/**
 * A running Next.js server, for the one test that genuinely needs HTTP (spec
 * 0010, AC-14; spec 0001's third runner constraint, deferred here by spec
 * 0004's Follow-up).
 *
 * WHY THIS EXISTS WHEN EVERY OTHER INTEGRATION TEST DRIVES MODULES DIRECTLY.
 * Driving a Server Action without a browser is a plain HTTP exchange and cannot
 * be anything else: React renders the action's identity into hidden fields on
 * the form, and the only way to learn those values is to fetch the page that
 * rendered them. Calling the exported function directly would prove the
 * function works and say nothing about whether it is reachable as an endpoint,
 * which is the half spec 0001 asked for.
 *
 * IT IS NOT A BROWSER, AND THIS IS NOT AN END TO END RUNNER. No page is
 * scripted, nothing is clicked, and no DOM is built. Playwright remains spec
 * 0004's recorded choice for the first test that genuinely needs one, and this
 * does not pre-empt it.
 *
 * `next dev` RATHER THAN A BUILD. The integration project runs without a build
 * step in CI, so requiring `.next` would make this test pass locally and fail
 * there for a reason unrelated to what it proves. The action ids are read out of
 * the rendered HTML either way, so the dev server's ids being different from a
 * production build's does not matter: spec 0004's Follow-up warns that an id
 * read from `server-reference-manifest.json` is only valid for a build made at
 * that same path, which is exactly why this reads them from the page instead.
 */

export interface AppServer {
  /** For example `http://127.0.0.1:53123`. No trailing slash. */
  readonly origin: string;
  readonly stop: () => Promise<void>;
}

/** How long the dev server gets to compile and answer its first request. */
const READY_TIMEOUT_MS = 120_000;

/** A free port from the operating system, so two runs never collide. */
async function freePort(): Promise<number> {
  const server = createServer();

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Could not reserve a port for the test server.");
  }

  const { port } = address;

  server.close();
  await once(server, "close");

  return port;
}

/**
 * Whether this attempt lost the `<distDir>/lock` race to a sibling test file
 * starting its own server at the same time, rather than a real failure.
 */
function lostLockRace(output: string): boolean {
  return output.includes("Another next dev server is already running");
}

/** How long `startAppServer()` retries losing the lock race before giving up. */
const LOCK_RETRY_BUDGET_MS = 180_000;

/**
 * Starts the application and waits until it answers, retrying if a sibling
 * test file currently holds the shared dist dir's lock.
 *
 * READINESS IS A REAL REQUEST, not a line of log output. A dev server prints
 * that it is listening well before it has compiled the route under test, so
 * polling a route is the only signal that means what it says. `/sign-in` is
 * polled rather than the route the test drives, because it needs no session and
 * a redirect from a protected route would count as an answer while proving
 * nothing had compiled.
 *
 * Throws rather than returning a failure value. Every path out of here is a
 * broken test setup, which is a programmer bug and should keep its stack.
 */
export async function startAppServer(): Promise<AppServer> {
  const deadline = Date.now() + LOCK_RETRY_BUDGET_MS;

  for (;;) {
    const attempt = await startOnce();

    if (attempt.ok) return attempt.server;
    if (!attempt.lockRace) throw attempt.error;
    if (Date.now() >= deadline) throw attempt.error;

    /**
     * SOMEBODY ELSE HOLDS THE LOCK, NOT A REAL FAILURE. `next dev` takes a
     * lock at `<distDir>/lock` and exits rather than starting a second
     * server in the same directory, so two test files calling
     * `startAppServer()` at the same time (the ordinary case, vitest runs
     * files in parallel) can race for it. A fixed, single `distDir` name is
     * deliberate, not an oversight: `tsconfig.json`'s `include` list names
     * it explicitly so Next never has to rewrite that committed file to add
     * a path, and a unique name per call was tried and reverted on
     * 2026-09-18 for exactly that reason, it grew the file by two lines on
     * every single test run, forever. Waiting out the lock instead serves
     * both files correctly, just not at the same moment.
     */
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function startOnce(): Promise<
  | { readonly ok: true; readonly server: AppServer }
  | { readonly ok: false; readonly error: Error; readonly lockRace: boolean }
> {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  /** Fixed and shared, matching the pre-declared entry in `tsconfig.json`. */
  const distDir = ".next-test";

  const child: ChildProcess = spawn(
    "pnpm",
    ["exec", "next", "dev", "--port", String(port), "--hostname", "127.0.0.1"],
    {
      /**
       * The parent's environment already carries `.env.test`, loaded by
       * `test/setup/load-env.ts` before anything else runs, so the server reads
       * the same local stack the rest of the suite does.
       */
      env: {
        ...process.env,
        NODE_ENV: "development",
        NEXT_DIST_DIR: distDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
      /**
       * ITS OWN PROCESS GROUP, so `stop()` can kill the whole tree rather
       * than only this immediate child. `pnpm exec next dev` spawns `next`,
       * which spawns its own Turbopack workers; signalling only the `pnpm`
       * process leaves those running. Found on 2026-09-18: after a test
       * finished and reported a clean pass, its `next dev`/`next-server`
       * pair were still alive minutes later, still holding `.next-test`
       * open, which is also what would have kept a sibling test file stuck
       * retrying the lock race above forever.
       */
      detached: true,
    },
  );

  /**
   * Kept so a failure to start can say what the server said. Without it the
   * only symptom is a timeout, and the real cause (a port clash, a missing
   * variable, a compile error) is nowhere in the output.
   */
  const output: string[] = [];

  child.stdout?.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => output.push(chunk.toString()));

  const stop = async (): Promise<void> => {
    if (
      child.exitCode === null &&
      child.signalCode === null &&
      child.pid !== undefined
    ) {
      /**
       * THE NEGATIVE PID SIGNALS THE WHOLE GROUP `detached: true` gave this
       * process, not just `pnpm` itself. `child.kill()` alone only reaches
       * `pnpm`, which is what left `next dev` and its `next-server` orphaned
       * and still holding `distDir` open.
       */
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        /** Already gone between the check above and here; nothing to do. */
      }

      const exited = await Promise.race([
        once(child, "exit").then(() => true),
        new Promise<false>((resolve) =>
          setTimeout(() => resolve(false), 5_000),
        ),
      ]);

      if (!exited) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /** Already gone. */
        }
      }
    }

    /**
     * `distDir` IS NOT REMOVED HERE, DELIBERATELY. It is the one shared,
     * stable name every call reuses (see above), so deleting it would only
     * cost the next caller a full recompile instead of reusing this run's
     * build cache, and risks racing a sibling file's `startOnce()` that is
     * mid retry waiting for exactly this process to release the lock.
     */
  };

  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      const combined = output.join("");

      return {
        ok: false,
        error: new Error(
          `The test server exited with code ${child.exitCode} before answering.\n${combined}`,
        ),
        lockRace: lostLockRace(combined),
      };
    }

    try {
      const response = await fetch(`${origin}/sign-in`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) return { ok: true, server: { origin, stop } };
    } catch {
      /** Not up yet. The deadline above is what ends this, not an error here. */
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await stop();

  return {
    ok: false,
    error: new Error(
      `The test server did not answer within ${READY_TIMEOUT_MS}ms.\n${output.join("")}`,
    ),
    lockRace: false,
  };
}
