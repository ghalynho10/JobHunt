import { createServer, type Server } from "node:http";
import { readFile, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";

import {
  afterAll,
  afterEach,
  beforeAll,
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
