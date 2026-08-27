import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

import { proxy } from "@/proxy";

import { createCookieJar, type CookieJar } from "../helpers/cookie-jar";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession, type MintedSession } from "../helpers/session";

/**
 * Spec 0001, DW-4 and BINDING RULE 6: the protected route thread.
 *
 * `/check verify` proved this by hand on 2026-08-20 against a `scaffold_check`
 * table feature 4 has since dropped, and through a password sign in feature 7
 * deletes. Both of those steps expired with the code they drove. What did not
 * expire is the rule underneath them: an unauthenticated request lands on the
 * sign in page rather than rendering an empty page that reads as success, and
 * the decision is made in the layout, never in `src/proxy.ts`.
 *
 * This locks that rule against the real local stack with real minted sessions,
 * so it survives feature 7 replacing the sign in path entirely.
 *
 * WHY `next/headers` IS THE ONE THING STUBBED HERE. The layout calls
 * `createClient()` with no argument, by design, so it reads the real request's
 * cookie store. There is no request in a test process, and `cookies()` throws
 * outside a request scope. The stub supplies a cookie store and nothing else:
 * the session is real, minted through the real auth API, and every decision
 * about what a session is, whether its token verifies, and which rows it may
 * read stays inside the application's own modules and the real policies. This
 * is a boundary the framework owns, not an assumption the code under test also
 * makes, which is the line the project's "no mock encoding the same assumption"
 * rule draws.
 */

/**
 * Hoisted, because `vi.mock` is lifted above the imports and the layout's own
 * import graph reaches `next/headers` while those imports are still being
 * evaluated. Each test assigns the jar it wants read.
 */
const requestScope = vi.hoisted(() => ({
  jar: undefined as CookieJar | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      getAll: () => requestScope.jar?.getAll() ?? [],
      set: (name: string, value: string, options: Record<string, unknown>) => {
        requestScope.jar?.setAll?.([{ name, value, options }], {});
      },
    }),
}));

/**
 * Imported after the mock is declared, for readability only: `vi.mock` is
 * hoisted above every import regardless of where it is written.
 */
const { default: AppLayout } = await import("@/app/(app)/layout");

/** What the layout hands back when it decides the caller may proceed. */
const PROTECTED_CONTENT = "the protected page";

const mintedUserIds: string[] = [];

/**
 * A real signed in session belonging to a user nobody else is using.
 *
 * THE FIXED POOL IS DELIBERATELY NOT USED HERE. Supabase invalidates a user's
 * previous magiclink the moment a new one is generated for the same address, so
 * two test files minting `dev-one@example.test` at the same time race and one
 * of them loses with "Email link is invalid or has expired". Vitest runs files
 * in parallel, so that is not a hypothetical: adding this file made
 * `fixtures.test.ts` fail that way until it stopped touching the pool.
 *
 * Spec 0004 already draws the line this follows: the fixed pool serves the read
 * only isolation proof, and everything else takes a fresh on demand user.
 * Nothing below needs a PARTICULAR identity, only a real one.
 */
async function signedInSession(prefix: string): Promise<MintedSession> {
  const user = await mintFixtureUser(prefix);
  mintedUserIds.push(user.id);

  return mintSession(user.email);
}

afterAll(async () => {
  // Every minted user is unique, so this is housekeeping rather than isolation.
  // Without it a local database accumulates a row per test run forever.
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

interface RedirectSignal {
  readonly type: string;
  readonly destination: string;
  readonly statusCode: number;
}

/**
 * Reads a Next.js redirect off the error it throws.
 *
 * `redirect()` "throws a NEXT_REDIRECT error and terminates rendering of the
 * route segment", per this version's own reference
 * (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/redirect.md`).
 * The digest is `NEXT_REDIRECT;<type>;<destination>;<status>;`, and it is split
 * here with the same arithmetic the installed `isRedirectError` uses, so a
 * destination containing a semicolon would still be read correctly.
 *
 * Read rather than imported: `isRedirectError` lives at an internal path
 * (`next/dist/client/components/redirect-error`) that carries no compatibility
 * promise.
 */
function redirectSignalOf(thrown: unknown): RedirectSignal {
  if (
    typeof thrown !== "object" ||
    thrown === null ||
    !("digest" in thrown) ||
    typeof thrown.digest !== "string"
  ) {
    throw new Error(
      `The layout threw something that is not a redirect: ${String(thrown)}. Failing is not the same as sending the caller to sign in.`,
    );
  }

  const parts = thrown.digest.split(";");

  if (parts[0] !== "NEXT_REDIRECT") {
    throw new Error(
      `Expected a NEXT_REDIRECT digest, got "${thrown.digest}". The layout is throwing a real error rather than redirecting.`,
    );
  }

  return {
    type: parts[1] ?? "",
    destination: parts.slice(2, -2).join(";"),
    statusCode: Number(parts.at(-2)),
  };
}

/**
 * Renders the layout with `jar` as the request's cookies, expecting a redirect.
 *
 * Fails loudly when the layout renders instead, because a layout that renders
 * for a caller it should have turned away is exactly the empty page that reads
 * as success DW-4 exists to rule out.
 */
async function redirectFrom(jar: CookieJar): Promise<RedirectSignal> {
  requestScope.jar = jar;

  try {
    await AppLayout({
      params: Promise.resolve({}),
      children: PROTECTED_CONTENT,
    });
  } catch (error) {
    return redirectSignalOf(error);
  }

  throw new Error(
    "The layout rendered the protected page for a caller with no valid session, rather than redirecting to /sign-in.",
  );
}

/** A request carrying the cookies a real browser would send for this session. */
async function requestWith(path: string, jar: CookieJar): Promise<NextRequest> {
  const request = new NextRequest(new URL(path, "http://localhost:3000"));

  for (const { name, value } of (await jar.getAll?.()) ?? []) {
    request.cookies.set(name, value);
  }

  return request;
}

describe("the protected layout is where the session is checked", () => {
  it("redirects an unauthenticated request to the sign in page", async () => {
    const signal = await redirectFrom(createCookieJar());

    expect(signal.destination).toBe("/sign-in");
    // `replace` rather than `push`: being turned away is not a history entry.
    expect(signal.type).toBe("replace");
    expect(signal.statusCode).toBe(307);
  });

  it("renders its children for a real signed in user", async () => {
    const session = await signedInSession("layout-render");
    requestScope.jar = session.jar;

    const rendered = await AppLayout({
      params: Promise.resolve({}),
      children: PROTECTED_CONTENT,
    });

    /**
     * The other half of the proof, and the half a redirect only test would
     * miss: a layout that redirected everybody would pass every case above
     * while making the application unusable.
     */
    expect(rendered).toBe(PROTECTED_CONTENT);
  });

  it("redirects when the session cookie has been tampered with", async () => {
    const session = await signedInSession("layout-tampered");
    const real = (await session.jar.getAll?.()) ?? [];

    expect(real.length).toBeGreaterThan(0);

    /**
     * The same session, altered in transit. This is what
     * `getClaims()` is called for rather than reading the cookie's contents:
     * the token is verified, so an edited one is refused. A layout that trusted
     * the cookie would hand the protected page to whoever wrote it.
     */
    const tampered = createCookieJar();
    tampered.setAll?.(
      real.map(({ name, value }) => ({
        name,
        value: `${value}-tampered`,
        options: {},
      })),
      {},
    );

    const signal = await redirectFrom(tampered);

    expect(signal.destination).toBe("/sign-in");
  });
});

describe("binding rule 6 holds with a real session too", () => {
  it("hands a signed in request onward without deciding anything", async () => {
    const session = await signedInSession("proxy-passthrough");
    const request = await requestWith("/health", session.jar);

    const response = await proxy(request);

    /**
     * The signed in half of the rule. `src/proxy.test.ts` proves the proxy does
     * not turn an anonymous caller away; this proves it does not decide in the
     * other direction either, having seen a valid session. It refreshes the
     * cookie and returns, and that is all it is allowed to do.
     */
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
