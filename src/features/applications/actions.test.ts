import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The wiring guarantees behind `recordApplication` (spec 0014, AC-20, AC-10).
 *
 * WHY THIS FILE EXISTS AT ALL, AND THE HISTORY IS THE POINT. The first attempt
 * to prove AC-20 was an integration test asserting that a real apply wrote no
 * session cookie. It passed. It also passed after `readOnlyCookieAdapter()` was
 * swapped back for the writing default, which was checked on purpose: a freshly
 * minted session never needs refreshing, so nothing writes a cookie either way
 * and the assertion could only ever confirm what its author already believed.
 * That is the escaped bug shape `docs/reflexes.md` records twice.
 *
 * WHAT ACTUALLY CATCHES THE REGRESSION is the wiring itself: whether the action
 * builds its client with an adapter that CANNOT write, whatever the session is
 * doing. That is what these tests assert, at the module boundary, and they fail
 * the moment somebody deletes the argument.
 *
 * WHAT THEY STILL DO NOT PROVE is the behaviour under a genuinely expired
 * token, which needs a real refresh and therefore a real browser session. That
 * step lives in `verify.md` and is `/check verify`'s to run. Naming the gap
 * here rather than implying these cover it.
 */

const createClient = vi.fn();
const insert = vi.fn(() => Promise.resolve({ error: null }));

vi.mock("@/lib/supabase/server", () => ({ createClient }));

const { recordApplication } = await import("./actions");
const { readOnlyCookieAdapter } =
  await import("@/lib/supabase/read-only-cookies");

const cookieStore = vi.hoisted(() => ({ written: [] as string[] }));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      getAll: () => [{ name: "sb-access-token", value: "fixture" }],
      set: (name: string) => {
        cookieStore.written.push(name);
      },
    }),
}));

/** A client that reports a signed in caller and accepts the insert. */
function fakeClient() {
  return {
    auth: {
      getClaims: () =>
        Promise.resolve({
          data: { claims: { sub: "8f1d2c3b-4a5e-4f60-9a7b-1c2d3e4f5a6b" } },
          error: null,
        }),
    },
    from: () => ({ insert }),
  };
}

beforeEach(() => {
  createClient.mockReset();
  insert.mockClear();
  cookieStore.written = [];
  createClient.mockImplementation(() => Promise.resolve(fakeClient()));
});

const listing = {
  source: "adzuna",
  sourceJobId: "1",
  title: "Engineer",
  companyName: "Fixture Systems",
  url: "https://example.test/1",
  salaryIsPredicted: false,
} as const;

describe("the apply action cannot write a session cookie (AC-20)", () => {
  it("builds its client with an adapter rather than the writing default", async () => {
    await recordApplication(listing);

    /**
     * THE ASSERTION THAT CATCHES THE REGRESSION. `createClient()` with no
     * argument uses `nextCookieAdapter`, which calls `cookieStore.set`. In a
     * Server Action that write succeeds, and a cookie mutation puts a re-render
     * of the current route into the action's response
     * (`node_modules/next/dist/docs/01-app/02-guides/server-actions.md:47`).
     * On `/search` that re-render re-runs the Adzuna search and spends one of
     * 25 weekly calls.
     */
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient.mock.calls[0]?.[0]).toBeDefined();
  });

  it("passes an adapter whose write is a no operation", async () => {
    await recordApplication(listing);

    const adapter = createClient.mock.calls[0]?.[0] as {
      setAll: (cookies: { name: string; value: string }[]) => void;
      getAll: () => unknown[];
    };

    /** It can still READ the session; refusing that would break the caller check. */
    expect(adapter.getAll()).toHaveLength(1);

    adapter.setAll([{ name: "sb-access-token", value: "refreshed" }]);

    /** And it writes nothing, which is the whole point. */
    expect(cookieStore.written).toEqual([]);
  });
});

describe("the read only adapter itself", () => {
  it("reads the real store and refuses every write", async () => {
    const adapter = await readOnlyCookieAdapter();

    expect(adapter.getAll?.()).toHaveLength(1);

    adapter.setAll?.(
      [{ name: "sb-access-token", value: "refreshed", options: {} }],
      /**
       * The adapter's own signature takes a second argument it never reads.
       * Passed as `undefined` rather than omitted so this call matches the type
       * the Supabase client would use.
       */
      undefined as never,
    );

    expect(cookieStore.written).toEqual([]);
  });
});

describe("the apply action triggers no re-render (AC-10)", () => {
  it("imports nothing that would re-render the page it was called from", async () => {
    /**
     * A SOURCE LEVEL GUARD, and deliberately so. The four function triggers
     * (`revalidatePath`, `updateTag`, `refresh`, `redirect`) cannot be observed
     * from a unit test without a request lifecycle, and by the time one of them
     * is reachable at runtime the call has already been spent. This reads the
     * module instead and fails if `recordApplication`'s own body ever grows one.
     *
     * `removeApplication` DOES call `revalidatePath`, correctly, so the check is
     * scoped to the apply function's body rather than to the file.
     */
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/features/applications/actions.ts", "utf8");

    const start = source.indexOf("export async function recordApplication");
    const end = source.indexOf("function insertFailure");

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const body = source.slice(start, end);

    for (const trigger of [
      "revalidatePath(",
      "updateTag(",
      "refresh(",
      "redirect(",
    ]) {
      expect(
        body,
        `recordApplication must not call ${trigger}: it re-renders /search, which re-runs the Adzuna search and spends one of 25 weekly calls (spec 0014, AC-10).`,
      ).not.toContain(trigger);
    }
  });
});
