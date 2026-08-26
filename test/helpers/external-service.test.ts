import { describe, expect, it } from "vitest";
import { z } from "zod";

import { recordedFetch } from "./recorder";
import { GITHUB } from "./services";

/**
 * Spec 0004, AC-2 and AC-8: an external service exercised against a REAL
 * recorded response rather than a hand written mock.
 *
 * The recording under `test/fixtures/github/` was captured once from the live
 * API and committed. Replay never touches the network, so this runs offline, in
 * CI, and on a plane, and it still exercises exactly the bytes GitHub sent.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. A hand written mock is written by the
 * same person, at the same moment, holding the same belief as the code it is
 * checking, so the two agree by construction and the test passes whether or not
 * that belief was ever true. The reference project's worst bug survived six
 * such tests. A recording cannot agree with a wrong belief: it is what the
 * service actually sent, and if the parser below were wrong about the shape,
 * this would fail.
 *
 * GitHub is the stand in, not the point. Adzuna (feature 11) and the model
 * router (feature 13) record their own fixtures with this same recorder.
 */

const FIXTURE = "repos-vercel-next-js";
const URL_RECORDED_FROM = "https://api.github.com/repos/vercel/next.js";

/**
 * Parsed at the boundary with Zod, per the project rule, exactly as a real
 * feature would parse a provider response. This is the half of the test that
 * has teeth: it asserts the shape the application would rely on, against real
 * bytes.
 */
const repositorySchema = z.object({
  id: z.number().int().positive(),
  full_name: z.string().min(1),
  private: z.boolean(),
  owner: z.object({ login: z.string().min(1) }),
  stargazers_count: z.number().int().nonnegative(),
});

describe("replaying a recorded external response", () => {
  it("returns what GitHub actually sent, without a network call", async () => {
    const recording = await recordedFetch(GITHUB, FIXTURE, {
      url: URL_RECORDED_FROM,
    });

    expect(recording.response.status).toBe(200);
    expect(recording.recordedFrom.url).toBe(URL_RECORDED_FROM);
  });

  it("parses into the shape a feature would actually rely on", async () => {
    const recording = await recordedFetch(GITHUB, FIXTURE, {
      url: URL_RECORDED_FROM,
    });

    const parsed = repositorySchema.safeParse(
      JSON.parse(recording.response.bodyText),
    );

    expect(parsed.success).toBe(true);
    expect(parsed.data?.full_name).toBe("vercel/next.js");
    expect(parsed.data?.owner.login).toBe("vercel");
    expect(parsed.data?.private).toBe(false);
  });

  it("kept the real headers the allow list permits", async () => {
    const recording = await recordedFetch(GITHUB, FIXTURE, {
      url: URL_RECORDED_FROM,
    });

    // Real headers from a real service, which is why GitHub was chosen: the
    // redaction in AC-13 is exercised against a genuine header set rather than
    // an invented one.
    expect(recording.response.headers["content-type"]).toContain(
      "application/json",
    );
    expect(recording.response.headers["x-ratelimit-limit"]).toBeDefined();
  });

  it("redacted everything the allow list does not name", async () => {
    const recording = await recordedFetch(GITHUB, FIXTURE, {
      url: URL_RECORDED_FROM,
    });

    // GitHub returns a `set-cookie` and a pile of internal tracing headers on
    // this endpoint. None of them is committed.
    for (const [name, value] of Object.entries(recording.response.headers)) {
      const allowed = GITHUB.keepHeaders.includes(name);
      if (allowed) continue;
      expect(value, `${name} was captured verbatim`).toBe("[redacted]");
    }
  });
});
