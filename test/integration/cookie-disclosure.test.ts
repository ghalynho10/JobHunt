import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { COOKIE_DISCLOSURES } from "@/features/legal/cookies";
import { RETURN_PATH_COOKIE } from "@/lib/return-path";

import { startAppServer, type AppServer } from "../helpers/app-server";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { mintSession, type MintedSession } from "../helpers/session";

/**
 * The compiled regex for one registry entry, by id.
 *
 * ASSERTING AGAINST THE REGISTRY, NOT AGAINST A NUMBER THIS FILE INVENTS.
 * The first draft of this test hardcoded its own expected patterns instead
 * of reading `cookies.ts`, which meant it proved its own assumptions rather
 * than the registry: editing or deleting an entry would not have failed it.
 */
function regexFor(id: string): RegExp {
  const cookie = COOKIE_DISCLOSURES.find((entry) => entry.id === id);

  if (cookie === undefined) {
    throw new Error(
      `No registry entry named "${id}". This test's own expectations are stale, not the registry.`,
    );
  }

  return new RegExp(cookie.nameRegex);
}

/**
 * Every real name that matches no registry entry at all.
 *
 * THE OTHER DIRECTION THE PRIMARY GUARD HAS TO CATCH, alongside an expected
 * cookie being absent: a cookie a real response carries that the registry
 * does not describe, which is exactly the shape of defect this whole
 * correction exists to close.
 */
function unregistered(names: readonly string[]): readonly string[] {
  return names.filter(
    (name) =>
      !COOKIE_DISCLOSURES.some((cookie) =>
        new RegExp(cookie.nameRegex).test(name),
      ),
  );
}

/**
 * Every cookie name observed across all three steps, filled in as each
 * describe block below runs. The final block, declared last so it runs
 * last, checks that every registry entry matched at least one of them: a
 * registry entry describing a cookie nothing in this suite ever produced
 * would otherwise pass silently, since each step above only checks the
 * entries relevant to it.
 */
const observedNames = new Set<string>();

/**
 * The cookie drift guard's primary net (spec 0009, AC-24).
 *
 * MEASURES WHAT A REAL VISITOR'S BROWSER RECEIVES, not what the source text
 * appears to do. `cookies.test.ts`'s scan is a cheap, known incomplete net;
 * this is what actually backs the claim on `/privacy`, per this project's own
 * standing rule (`docs/reflexes.md`, added 2026-08-28).
 *
 * THREE STEPS, EACH ASSERTED SEPARATELY, because the three cookies this app
 * sets appear at three different points and an absent one at the wrong step
 * must read as a wrong test, not a missing disclosure:
 *
 * 1. Starting sign in writes the PKCE verifier cookie. `signInWithOAuth()`
 *    builds the provider's authorization URL entirely client side
 *    (`_getUrlForProvider` in the installed `@supabase/auth-js`, no network
 *    call), so this step needs no configured Google or GitHub credentials and
 *    no real provider round trip, only the local stack.
 * 2. The callback clears the return path cookie unconditionally, on every
 *    path out of the handler, including a failed exchange. A garbage `code`
 *    is enough to prove that half; completing a real exchange needs a real
 *    provider, which this suite does not have.
 * 3. An ordinary signed in navigation is where the session cookie itself is
 *    observed.
 */

const SETUP_TIMEOUT_MS = 180_000;

let server: AppServer;

beforeAll(async () => {
  server = await startAppServer();
}, SETUP_TIMEOUT_MS);

afterAll(async () => {
  await server?.stop();
});

/** Every `Set-Cookie` header on a response, as `name=value` pairs split apart. */
function setCookies(
  headers: Headers,
): readonly { readonly name: string; readonly value: string }[] {
  return headers.getSetCookie().map((raw) => {
    const [pair] = raw.split(";");
    const [name, ...rest] = (pair ?? "").split("=");

    return { name: name ?? "", value: rest.join("=") };
  });
}

/** The one `<form>` on the page whose visible text contains this marker. */
function formContainingText(html: string, marker: string): string {
  for (const chunk of html.split("<form").slice(1)) {
    const form = chunk.split("</form>")[0] ?? "";

    if (form.includes(marker)) return `<form${form}</form>`;
  }

  throw new Error(
    `No form on the page contains "${marker}". The page rendered a different state than the test expected.`,
  );
}

/**
 * Every hidden action field React rendered onto the form.
 *
 * TWO DIFFERENT SHAPES, AND THIS IS THE UNBOUND ONE. `profile-form.test.ts`'s
 * technique reads `$ACTION_REF_n`/`$ACTION_n:0` (JSON) /`$ACTION_n:1`/
 * `$ACTION_KEY`, which is what a BOUND action renders (`fn.bind(null, arg)`,
 * every profile form). `signInWithGoogle`/`signInWithGitHub` are passed
 * directly as `action={signInWithGoogle}`, unbound, which renders one single
 * field instead, `$ACTION_ID_<hash>`, carrying no separate `value` attribute
 * at all: the name alone is the whole reference. Verified against the served
 * markup on 2026-09-18, React 19.2.8 and Next.js 16.3.1, the versions in
 * `package.json`.
 */
function hiddenActionFields(html: string): Readonly<Record<string, string>> {
  const fields: Record<string, string> = {};
  const pattern = /<input[^>]*type="hidden"[^>]*>/g;

  for (const tag of html.match(pattern) ?? []) {
    const name = /name="([^"]*)"/.exec(tag)?.[1];
    const value = /value="([^"]*)"/.exec(tag)?.[1] ?? "";

    if (name === undefined) continue;
    if (!name.startsWith("$ACTION_ID_") && !name.startsWith("$ACTION")) {
      continue;
    }

    fields[unescapeHtml(name)] = unescapeHtml(value);
  }

  return fields;
}

function unescapeHtml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

describe("starting sign in writes the PKCE verifier cookie (covers AC-24)", () => {
  it("writes a code verifier cookie and the return path cookie, on the response redirecting to the provider", async () => {
    /**
     * `?next=/search` is what makes `rememberReturnPath()` write a cookie at
     * all: an absent or unvalidated value writes nothing, per its own doc
     * comment in `src/features/auth/actions.ts`.
     */
    const page = await fetch(`${server.origin}/sign-in?next=%2Fsearch`);

    expect(page.status).toBe(200);

    const html = await page.text();
    const form = formContainingText(html, "Sign in with Google");
    const hidden = hiddenActionFields(form);

    expect(
      Object.keys(hidden).some((name) => name.startsWith("$ACTION_ID_")),
      "React renders the unbound action's identity as a single hidden field",
    ).toBe(true);

    /**
     * NOT PART OF `hiddenActionFields`, DELIBERATELY: that helper reads only
     * the action's own identity, and the `next` field is an ordinary form
     * field `ReturnPathField` renders alongside it (`provider-forms.tsx`).
     * Missing this the first time this test was written is exactly the bug
     * it exists to catch: the response came back with no return path cookie
     * at all, because the value never reached `rememberReturnPath()`.
     */
    const nextValue = /name="next" value="([^"]*)"/.exec(form)?.[1];

    expect(nextValue, "the next field should be on this form").toBeDefined();

    const body = new FormData();

    for (const [name, value] of Object.entries(hidden))
      body.append(name, value);
    body.append("next", unescapeHtml(nextValue ?? ""));

    const response = await fetch(`${server.origin}/sign-in`, {
      method: "POST",
      body,
      redirect: "manual",
    });

    /** `redirect()` in a Server Action answers a form POST with 303. */
    expect(response.status).toBe(303);

    const cookies = setCookies(response.headers);
    const names = cookies.map((cookie) => cookie.name);

    for (const name of names) observedNames.add(name);

    expect(
      names.some((name) => regexFor("pkce-verifier").test(name)),
      `Expected a PKCE verifier cookie (registry pattern) among: ${names.join(", ")}`,
    ).toBe(true);

    expect(
      names.some((name) => regexFor("return-path").test(name)),
      `Expected the return path cookie (registry pattern) among: ${names.join(", ")}`,
    ).toBe(true);

    expect(
      unregistered(names),
      "Every cookie a real response carries must match a registry entry.",
    ).toEqual([]);

    const returnPath = cookies.find(
      (cookie) => cookie.name === RETURN_PATH_COOKIE,
    );

    expect(
      returnPath,
      `Expected ${RETURN_PATH_COOKIE} among: ${names.join(", ")}`,
    ).toBeDefined();

    /**
     * DECODED TWICE, and that is real rather than a mistake to simplify away.
     * `rememberReturnPath()` calls `encodeURIComponent` once itself
     * (`src/features/auth/actions.ts`); the cookie serializer Next writes
     * with percent encodes a value again on top of that per RFC 6265, which
     * `cookies().get()` normally undoes transparently on the read side. This
     * test reads the raw wire bytes directly, bypassing that undo, so it has
     * to apply both decodes itself.
     */
    expect(
      decodeURIComponent(decodeURIComponent(returnPath?.value ?? "")),
    ).toBe("/search");
  });
});

describe("the callback clears the return path cookie (covers AC-24)", () => {
  it("clears jobhunt_return_path even when the exchange fails", async () => {
    const response = await fetch(
      `${server.origin}/auth/callback?error=access_denied&error_description=test`,
      {
        headers: { cookie: `${RETURN_PATH_COOKIE}=%2Fsearch` },
        redirect: "manual",
      },
    );

    expect([302, 303]).toContain(response.status);

    const cookies = setCookies(response.headers);
    const names = cookies.map((cookie) => cookie.name);

    for (const name of names) observedNames.add(name);

    expect(
      unregistered(names),
      "Every cookie a real response carries must match a registry entry.",
    ).toEqual([]);

    const cleared = cookies.find((cookie) =>
      regexFor("return-path").test(cookie.name),
    );

    expect(
      cleared,
      `Expected the return path cookie (registry pattern) to be cleared on the response, among: ${names.join(", ")}`,
    ).toBeDefined();
    expect(cleared?.value).toBe("");

    const rawHeader = response.headers
      .getSetCookie()
      .find((raw) => raw.startsWith(`${RETURN_PATH_COOKIE}=`));

    expect(
      rawHeader,
      "the clear must repeat the exact Path it was written with, or it silently fails to match (src/lib/return-path.ts)",
    ).toMatch(/Path=\/auth\/callback/i);
  });
});

/** `getAll()` is awaited per `CookieMethodsServer`; the in memory jar answers synchronously. */
async function cookieHeader(session: MintedSession): Promise<string> {
  const cookies = (await session.jar.getAll()) ?? [];

  return cookies.map(({ name, value }) => `${name}=${value}`).join("; ");
}

describe("a signed in session carries the session cookie (covers AC-24)", () => {
  let userId: string;

  afterEach(async () => {
    if (userId !== undefined) await deleteFixtureUser(userId);
  });

  it("accepts a real minted session on an ordinary navigation", async () => {
    const user = await mintFixtureUser("cookie-disclosure");
    userId = user.id;
    const session = await mintSession(user.email);

    const response = await fetch(`${server.origin}/search`, {
      headers: { cookie: await cookieHeader(session) },
      redirect: "manual",
    });

    expect(response.status).toBe(200);
  });

  /**
   * MEASURED HERE, NOT ASSUMED FROM `src/proxy.ts`'s OWN COMMENTS: a freshly
   * minted session, not near its access token's expiry, produces NO
   * `Set-Cookie` at all on the request above. `@supabase/auth-js` only
   * rewrites the cookie when it actually rotates the token, and a fresh mint
   * has nothing to rotate. The spec's Build plan said an ordinary navigation
   * is "where the Supabase session cookie itself is present and refreshed",
   * which reads as unconditional and is not; it should read "refreshed when
   * the access token needs it", and this test is what caught the gap between
   * the two readings. So this cookie's real name is proved a different way:
   * through the same adapter (`src/lib/supabase/server.ts`) `mintSession()`
   * already drives over a real network exchange with the local Supabase auth
   * server (`verifyOtp`), which is the application's own code path, not a
   * parallel implementation built for this test (spec 0004's principle).
   * Forcing a real token rotation to observe this over HTTP as well would
   * need either a near-expiry session or a second local Supabase project
   * with a short token lifetime; recorded as a Follow-up rather than built
   * here.
   */
  it("names the cookie mintSession() itself writes, through the app's own adapter", async () => {
    const user = await mintFixtureUser("cookie-disclosure");
    userId = user.id;
    const session = await mintSession(user.email);

    const names = ((await session.jar.getAll()) ?? []).map(
      (cookie) => cookie.name,
    );

    for (const name of names) observedNames.add(name);

    expect(
      names.some((name) => regexFor("session").test(name)),
      `Expected a session cookie (registry pattern) among: ${names.join(", ")}.`,
    ).toBe(true);

    expect(
      unregistered(names),
      "Every cookie a real session carries must match a registry entry.",
    ).toEqual([]);
  });
});

/**
 * DECLARED LAST SO IT RUNS LAST (vitest keeps declaration order within one
 * file). Catches the direction none of the per step checks above can: a
 * registry entry describing a cookie that nothing in this whole suite ever
 * produced. Each earlier block only asserts the entries relevant to its own
 * step, so an extra, unexercised entry would otherwise pass every one of
 * them silently.
 */
describe("every registry entry matched a real cookie somewhere in this suite (covers AC-24)", () => {
  it("has no entry that never appeared", () => {
    const unmatched = COOKIE_DISCLOSURES.filter(
      (cookie) =>
        ![...observedNames].some((name) =>
          new RegExp(cookie.nameRegex).test(name),
        ),
    ).map((cookie) => cookie.id);

    expect(
      unmatched,
      `Registry entries with no matching cookie observed across all three steps: ${unmatched.join(", ")}. Observed: ${[...observedNames].join(", ")}`,
    ).toEqual([]);
  });
});
