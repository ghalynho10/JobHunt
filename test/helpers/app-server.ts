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
 * Starts the application and waits until it answers.
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
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;

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
        /**
         * ITS OWN OUTPUT DIRECTORY, AND THAT IS WHAT MAKES THIS WORK AT ALL.
         * `next dev` takes a lock at `<distDir>/lock` and exits rather than
         * starting a second server in the same directory, so without this the
         * test would fail for anybody with `pnpm dev` already running, and pass
         * for everybody else. `next.config.ts` reads the variable and is
         * unchanged when it is absent.
         */
        NEXT_DIST_DIR: ".next-test",
      },
      stdio: ["ignore", "pipe", "pipe"],
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
    if (child.exitCode !== null || child.signalCode !== null) return;

    child.kill("SIGTERM");
    await once(child, "exit");
  };

  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `The test server exited with code ${child.exitCode} before answering.\n${output.join("")}`,
      );
    }

    try {
      const response = await fetch(`${origin}/sign-in`, {
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) return { origin, stop };
    } catch {
      /** Not up yet. The deadline above is what ends this, not an error here. */
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  await stop();

  throw new Error(
    `The test server did not answer within ${READY_TIMEOUT_MS}ms.\n${output.join("")}`,
  );
}
