import { createServer, type Server } from "node:http";
import { readFile, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { fixtureMode, fixturePath, recordedFetch, REDACTED } from "./recorder";
import { CREDENTIAL_CARRYING, GITHUB } from "./services";

/**
 * Spec 0004, AC-8, AC-9 and AC-13.
 *
 * AC-13 IS PROVED THROUGH A REAL CAPTURE, not by calling the redaction function
 * directly. Testing `redact()` on its own would prove the function exists and
 * say nothing about whether record mode actually calls it, which is the bug
 * that would matter: a credential reaches git either way. So record mode runs
 * end to end here, over a real HTTP request, and the assertion is made against
 * the bytes that landed on disk.
 *
 * The server is local rather than external. AC-13 needs a request genuinely
 * carrying an API key, a bearer token and a `set-cookie`, and no real service
 * should be handed those just to prove a point. Everything else about the path
 * is real: a real socket, real `fetch`, real headers, real file write.
 */

let server: Server;
let origin: string;

beforeAll(async () => {
  server = createServer((request, response) => {
    // Routes for the body shapes `redactBody()` has to cope with.
    if (request.url?.startsWith("/v1/nested")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ data: { auth: { password: "nested-secret-value" } } }),
      );
      return;
    }
    if (request.url?.startsWith("/v1/array")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify([
          { refresh_token: "array-secret-value", id: 1 },
          { refresh_token: "another-one", id: 2 },
        ]),
      );
      return;
    }
    if (request.url?.startsWith("/v1/plain")) {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("not json at all");
      return;
    }
    /**
     * THE ADZUNA SHAPE (spec 0013). The service copies the caller's own
     * credential back into a URL inside an ordinary, undeclared field. No
     * field here is named in `secretBodyFields`, and none could sensibly be:
     * `redirect_url` is not a secret, it merely contains one. This is the
     * route that proves redaction by value, not just by position.
     */
    if (request.url?.startsWith("/v1/echoes-key-in-url")) {
      const sent = new URL(request.url, origin).searchParams.get("api_key");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          results: [
            {
              id: 1,
              redirect_url: `https://example.test/land/1?utm_source=${sent}&v=abc`,
            },
            {
              id: 2,
              redirect_url: `https://example.test/land/2?utm_source=${sent}&v=def`,
            },
          ],
        }),
      );
      return;
    }

    response.writeHead(200, {
      "content-type": "application/json",
      // The three things AC-13 names, on their way back out.
      "set-cookie": "session=super-secret-cookie-value; Path=/; HttpOnly",
      "x-api-key": "echoed-api-key-9876",
      authorization: "Bearer echoed-token-5432",
      "cache-control": "max-age=60",
    });
    response.end(JSON.stringify({ ok: true, password: "hunter2", id: 7 }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("fixtureMode()", () => {
  it("replays by default, so a silent run never reaches the network", () => {
    vi.stubEnv("TEST_FIXTURE_MODE", undefined);
    expect(fixtureMode()).toBe("replay");
  });

  it("refuses an unrecognised value rather than falling back to replay", () => {
    vi.stubEnv("TEST_FIXTURE_MODE", "recording");
    expect(() => fixtureMode()).toThrow(/neither "record" nor "replay"/);
  });
});

describe("replay of a missing recording (AC-9)", () => {
  it("fails loudly, naming the file and the command that records it", async () => {
    vi.stubEnv("TEST_FIXTURE_MODE", "replay");

    const attempt = recordedFetch(GITHUB, "definitely-not-recorded", {
      url: "https://api.github.com/repos/vercel/next.js",
    });

    // Names the file, so the reader knows exactly what is missing...
    await expect(attempt).rejects.toThrow(/definitely-not-recorded\.json/);
    // ...and names the way out, so they do not have to go and find it.
    await expect(attempt).rejects.toThrow(/TEST_FIXTURE_MODE=record/);
  });

  it("does not reach the network on the way to failing", async () => {
    vi.stubEnv("TEST_FIXTURE_MODE", "replay");

    const realFetch = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = ((input: unknown, init?: unknown) => {
      calls.push(String(input));
      return realFetch(input as RequestInfo, init as RequestInit | undefined);
    }) as typeof globalThis.fetch;

    try {
      await expect(
        recordedFetch(GITHUB, "also-not-recorded", {
          url: "https://api.github.com/repos/vercel/next.js",
        }),
      ).rejects.toThrow();

      // The whole point of AC-9. A quiet fall through to the live service would
      // make the suite pass on the machine that has the fixture and fail on the
      // one that does not, and would put a real network call inside a run that
      // promised not to make one.
      expect(calls).toEqual([]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("record mode redaction (AC-13)", () => {
  const NAME = "redaction-probe";
  const path = fixturePath(CREDENTIAL_CARRYING, NAME);

  /**
   * These tests deliberately drive record mode, which now writes its warning
   * straight to `process.stderr` so a human cannot miss it. Captured here
   * rather than left to print, for two reasons. It keeps `pnpm test` output
   * clean, and more importantly the warning says the recording "reached the
   * live network", which is true of a real capture and false of these: they
   * reach a local server on 127.0.0.1. A warning that cries wolf on every
   * ordinary test run is how a real one stops being read.
   */
  let stderrOut: string[] = [];

  beforeEach(() => {
    stderrOut = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      stderrOut.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    // This recording is written by the test and must never be committed, unlike
    // the GitHub one, which is evidence and is.
    await rm(path, { force: true });
  });

  it("writes a recording holding none of the three credentials", async () => {
    vi.stubEnv("TEST_FIXTURE_MODE", "record");

    const recording = await recordedFetch(CREDENTIAL_CARRYING, NAME, {
      url: `${origin}/v1/search?api_key=super-secret-key&q=engineer`,
      init: {
        method: "POST",
        headers: {
          authorization: "Bearer secret-bearer-token-1234",
          "x-api-key": "secret-api-key-abcd",
          "content-type": "application/json",
        },
        body: JSON.stringify({ password: "hunter2", q: "engineer" }),
      },
    });

    expect(recording.response.status).toBe(200);

    // Asserted against THE BYTES ON DISK, not the returned object. The file is
    // what gets committed, so the file is what has to be clean.
    const written = await readFile(path, "utf8");

    // 1. The API key, in the request header, the response header, and the query
    //    string it was also sent in.
    expect(written).not.toContain("secret-api-key-abcd");
    expect(written).not.toContain("echoed-api-key-9876");
    expect(written).not.toContain("super-secret-key");
    // 2. The bearer token, sent and echoed.
    expect(written).not.toContain("secret-bearer-token-1234");
    expect(written).not.toContain("echoed-token-5432");
    // 3. The set-cookie value.
    expect(written).not.toContain("super-secret-cookie-value");
    // And the declared body field.
    expect(written).not.toContain("hunter2");
  });

  it("scrubs a credential the service echoed into an undeclared field", async () => {
    /**
     * THE REGRESSION TEST FOR A REAL, NEAR MISS LEAK (spec 0013, feature 11).
     * Adzuna returns every listing with `redirect_url=...&utm_source=<app_id>`,
     * so the first real recording written for that feature carried the live
     * application id twenty times. Redaction by position could not catch it:
     * `redirect_url` is not a credential field, it just contains one, and no
     * declaration could reasonably name it.
     *
     * Redaction by VALUE catches it, using what the request itself carried.
     * Break `secretValues()` or `scrubValues()` in `recorder.ts` and this test
     * fails with the credential sitting in the committed bytes, which is
     * exactly what it is here to prevent.
     */
    vi.stubEnv("TEST_FIXTURE_MODE", "record");

    await recordedFetch(CREDENTIAL_CARRYING, NAME, {
      url: `${origin}/v1/echoes-key-in-url?api_key=super-secret-key`,
    });

    const written = await readFile(path, "utf8");

    expect(written).not.toContain("super-secret-key");
    // The surrounding URL survives, so the recording is still usable evidence.
    expect(written).toContain("utm_source=");
    expect(written).toContain("https://example.test/land/1");
    expect(written).toContain("v=abc");
  });

  it("leaves a short secret alone rather than shredding the recording", async () => {
    /**
     * The deliberate limit on the value pass, asserted so it is a decision
     * rather than an accident. A very short credential would match ordinary
     * punctuation and characters throughout a body, and a recording sprayed
     * with `[redacted]` is worse than the leak it prevents: it stops being
     * evidence of anything. Six characters is the floor.
     */
    vi.stubEnv("TEST_FIXTURE_MODE", "record");

    await recordedFetch(CREDENTIAL_CARRYING, NAME, {
      url: `${origin}/v1/echoes-key-in-url?api_key=abc`,
    });

    const written = await readFile(path, "utf8");

    // Still redacted where it was DECLARED (the query parameter itself)...
    expect(
      new URL(JSON.parse(written).recordedFrom.url).searchParams.get("api_key"),
    ).toBe(REDACTED);
    // ...but not scrubbed blindly out of the body.
    expect(written).toContain("utm_source=abc");
  });

  it("keeps the shape it redacted, so a reviewer can see what was there", async () => {
    vi.stubEnv("TEST_FIXTURE_MODE", "record");

    await recordedFetch(CREDENTIAL_CARRYING, NAME, {
      url: `${origin}/v1/search?api_key=super-secret-key`,
      init: {
        method: "POST",
        headers: { authorization: "Bearer secret-bearer-token-1234" },
        body: JSON.stringify({ password: "hunter2" }),
      },
    });

    const written = JSON.parse(await readFile(path, "utf8")) as {
      recordedFrom: { url: string; headers: Record<string, string> };
      response: { headers: Record<string, string>; bodyText: string };
    };

    // The header NAMES survive. Knowing a `set-cookie` came back is useful; its
    // value is exactly what must not be committed.
    expect(written.response.headers["set-cookie"]).toBe(REDACTED);
    expect(written.recordedFrom.headers["authorization"]).toBe(REDACTED);
    /**
     * Read through `URL` rather than matched as a substring: the placeholder's
     * brackets are percent encoded in a query string, so the raw text reads
     * `api_key=%5Bredacted%5D`. That is correct encoding rather than a leak,
     * and comparing the decoded value says what is actually meant.
     */
    expect(new URL(written.recordedFrom.url).searchParams.get("api_key")).toBe(
      REDACTED,
    );
    expect(JSON.parse(written.response.bodyText)).toMatchObject({
      password: REDACTED,
    });

    // Allow listed headers are kept verbatim, or the recording would be useless
    // for anything that has to parse a real response.
    expect(written.response.headers["content-type"]).toBe("application/json");
    expect(written.response.headers["cache-control"]).toBe("max-age=60");
  });

  it("warns on the way out, somewhere a human will actually see it", async () => {
    vi.stubEnv("TEST_FIXTURE_MODE", "record");

    /**
     * AC-8's warning half, and the reason this test exists at all: the warning
     * was being written and then swallowed, because Vitest intercepts every
     * `console.*` call and prints none of them for a passing test. Nothing
     * asserted the warning, so nothing noticed. This asserts the CHANNEL as
     * well as the text, since a warning nobody sees is not a warning.
     */
    await recordedFetch(CREDENTIAL_CARRYING, NAME, {
      url: `${origin}/v1/search`,
    });

    const warning = stderrOut.join("");

    expect(warning).toContain("RECORDED a real response");
    expect(warning).toContain("reached the live network");
    // Names the file, so the human knows which one to go and read.
    expect(warning).toContain(NAME);
  });

  /**
   * The shapes the first version of `redactBody()` passed through untouched,
   * each with no signal that nothing had been scanned. Found by a fresh model
   * review on 2026-08-27. These are the tests that would have caught it.
   */
  it("redacts a credential nested below the top level", async () => {
    vi.stubEnv("TEST_FIXTURE_MODE", "record");

    await recordedFetch(CREDENTIAL_CARRYING, NAME, {
      url: `${origin}/v1/nested`,
    });

    const written = await readFile(path, "utf8");

    // The old version only checked top level keys, so this survived to disk.
    expect(written).not.toContain("nested-secret-value");
    const body = JSON.parse(
      (JSON.parse(written) as { response: { bodyText: string } }).response
        .bodyText,
    ) as { data: { auth: { password: string } } };
    expect(body.data.auth.password).toBe(REDACTED);
  });

  it("redacts inside a top level array", async () => {
    vi.stubEnv("TEST_FIXTURE_MODE", "record");

    await recordedFetch(CREDENTIAL_CARRYING, NAME, {
      url: `${origin}/v1/array`,
    });

    const written = await readFile(path, "utf8");

    // A search API returning a bare array of results is an ordinary shape, and
    // the old version skipped it entirely because it was not an object.
    expect(written).not.toContain("array-secret-value");
    const body = JSON.parse(
      (JSON.parse(written) as { response: { bodyText: string } }).response
        .bodyText,
    ) as { refresh_token: string }[];
    expect(body[0]?.refresh_token).toBe(REDACTED);
    // The rest of the array survives, or the recording would be useless.
    expect(body).toHaveLength(2);
  });

  it("refuses to write at all when a declared body cannot be scanned", async () => {
    vi.stubEnv("TEST_FIXTURE_MODE", "record");

    // Not JSON, so the declared fields cannot be located. The old version wrote
    // the body verbatim and said nothing.
    await expect(
      recordedFetch(CREDENTIAL_CARRYING, NAME, { url: `${origin}/v1/plain` }),
    ).rejects.toThrow(/cannot be scanned|not JSON/);

    // No file, rather than a file nobody checked. Refusing loudly beats writing
    // something that looks redacted and is not.
    await expect(readFile(path, "utf8")).rejects.toThrow();
  });

  it("leaves a body alone when the service declares no credential fields", async () => {
    vi.stubEnv("TEST_FIXTURE_MODE", "record");

    // GITHUB declares none, so its bodies are never parsed and never refused.
    // Without this, the refusal above would break every service that has no
    // credential in its body, which is most of them.
    const recording = await recordedFetch(GITHUB, "plain-text-probe", {
      url: `${origin}/v1/plain`,
    });

    expect(recording.response.bodyText).toContain("not json at all");
    await rm(fixturePath(GITHUB, "plain-text-probe"), { force: true });
  });

  it("strips a credential carrying url fragment", async () => {
    vi.stubEnv("TEST_FIXTURE_MODE", "record");

    await recordedFetch(CREDENTIAL_CARRYING, NAME, {
      url: `${origin}/v1/search#access_token=fragment-secret-value`,
    });

    const written = await readFile(path, "utf8");

    // The OAuth implicit grant puts a token here, and `secretQueryParams` has
    // no equivalent for the fragment, so it is dropped whole.
    expect(written).not.toContain("fragment-secret-value");
    expect(new URL(JSON.parse(written).recordedFrom.url as string).hash).toBe(
      "",
    );
  });

  it("redacts a header the allow list has never heard of", async () => {
    vi.stubEnv("TEST_FIXTURE_MODE", "record");

    await recordedFetch(CREDENTIAL_CARRYING, NAME, {
      url: `${origin}/v1/search`,
      init: { headers: { "x-some-brand-new-header": "leak-me" } },
    });

    const written = await readFile(path, "utf8");

    // An allow list, not a block list, precisely so a header nobody anticipated
    // is redacted by default rather than captured because no one added it.
    expect(written).not.toContain("leak-me");
  });
});
