import { describe, expect, it, vi } from "vitest";

import { AppHeader } from "@/features/app-shell/app-header";
import { success } from "@/lib/result";

import {
  findAllByType,
  flatten,
  textOf,
} from "../../../test/helpers/react-element";

/**
 * Spec 0008, AC-1, AC-2 and AC-5: every route under `(app)` composes the shell.
 *
 * WHY THIS FILE EXISTS, AND IT IS NOT COVERAGE. Spec 0008 revision 5 moved the
 * signed in header out of the `(app)` layout and into each route, because a
 * layout never learns the pathname and AC-5 needs the current route passed in.
 * That trade bought a correct `aria-current` and cost four call sites where
 * there used to be one.
 *
 * `app-header.test.ts` does NOT cover that cost. It calls `AppHeader` with props
 * written in the test, so it proves the component renders the marker correctly
 * and can never fail when a ROUTE passes the wrong value. The dangerous mistake
 * is not a missing header, which anyone would see. It is `/profile` shipping
 * `current="search"` after a copy and paste: the page looks perfect and
 * `aria-current="page"` quietly points a screen reader at the wrong item. The
 * cross check on spec 0008 revision 5 named this gap, and this file closes it.
 *
 * These are the call sites, asserted as a set rather than one by one, because
 * the invariant is about the group: no route under `(app)` may ship without the
 * shell, and no two routes may claim to be the same page.
 */

/**
 * `/health` reads real data, and this file is not about that data. Its two reads
 * are replaced at the module boundary so the page can render; everything the
 * assertions below touch, the header call site and the sign out control, is the
 * page's own composition. `src/features/profile/queries.ts` and
 * `src/lib/kill-switch.ts` have their own tests against the real stack.
 */
vi.mock("@/features/profile/queries", () => ({
  readOwnProfile: () =>
    Promise.resolve(
      success({
        id: "0f5f4f1e-3a2b-4c7d-9e8f-1a2b3c4d5e6f",
        full_name: "Fixture Person",
        location: undefined,
        summary: undefined,
      }),
    ),
  /**
   * Added when feature 9 gave `/profile` its real reads (spec 0010). This file
   * asserts the shell, not the data, and a page that cannot render reads its
   * header to nobody.
   */
  readProfileSections: () =>
    Promise.resolve(
      success({ skills: [], experience: [], preferences: undefined }),
    ),
}));

vi.mock("@/lib/kill-switch", () => ({
  readKillSwitch: () =>
    Promise.resolve(success({ enabled: false, updatedAt: "2026-08-31" })),
}));

/**
 * Added when feature 11 gave `/search` its real reads (spec 0013). A bare
 * visit, which is the only state this file renders, reads the caller's
 * `job_preference` row to prefill the form (AC-9) and never calls Adzuna.
 * That read has its own tests; this file asserts the shell.
 */
vi.mock("@/features/search/preferences", () => ({
  readSearchPrefill: () =>
    Promise.resolve(success({ title: undefined, location: undefined })),
}));

const { default: SearchPage } = await import("./search/page");

/**
 * `/search` takes route props and reads the query string since feature 11
 * (spec 0013). No `q` and no `where` is the bare visit, which runs no search
 * and spends no usage gate budget (AC-9), and is the state this file is about.
 */
function renderSearch() {
  return SearchPage({ searchParams: Promise.resolve({}) });
}
const { default: ProfilePage } = await import("./profile/page");

/**
 * `/profile` takes route props and reads the query string since feature 9 (spec
 * 0010, AC-13). An empty search string is the plain view, which is the state
 * every assertion in this file is about.
 */
function renderProfile() {
  return ProfilePage({
    params: Promise.resolve({}),
    searchParams: Promise.resolve({}),
  });
}
const { default: ApplicationsPage } = await import("./applications/page");
const { default: HealthPage } = await import("./health/page");

/** The one `AppHeader` a route composed, with the props it was given. */
function headerOf(rendered: unknown) {
  const headers = findAllByType(rendered as never, AppHeader);

  expect(
    headers,
    "every route under (app) composes exactly one AppHeader",
  ).toHaveLength(1);

  return headers[0]?.props as { readonly current?: string };
}

describe("every route under (app) wears the shell (AC-1, AC-5)", () => {
  it("composes the header on all four routes, including the diagnostic", async () => {
    /**
     * `/health` is in the group and NOT in the navigation (AC-22), so it takes
     * the header with no `current`. Leaving it out of this list is how a route
     * quietly loses its chrome.
     */
    expect(headerOf(await renderSearch())).toBeDefined();
    expect(headerOf(await renderProfile())).toBeDefined();
    expect(headerOf(ApplicationsPage())).toBeDefined();
    expect(headerOf(await HealthPage())).toBeDefined();
  });

  it.each([
    ["/search", renderSearch, "search"],
    ["/profile", renderProfile, "profile"],
  ] as const)(
    "%s tells the header it is the current page",
    async (_route, render, expected) => {
      // covers: AC-5
      expect(headerOf(await render()).current).toBe(expected);
    },
  );

  it.each([
    ["/applications", () => ApplicationsPage()],
    ["/health", async () => await HealthPage()],
  ] as const)(
    "%s claims no current page, because it is in no navigation",
    async (_route, render) => {
      /**
       * AC-1 and AC-22: neither route is in the navigation, so neither may mark
       * a nav item as the page being viewed. Marking one would tell a screen
       * reader user they are somewhere they are not.
       */
      expect(headerOf(await render()).current).toBeUndefined();
    },
  );

  it("gives no two routes the same current value", async () => {
    /**
     * THE COPY AND PASTE GUARD, and the reason this file exists. Every earlier
     * assertion here would still pass if `/profile` were changed to
     * `current="search"`, as long as each was updated to match. This one would
     * not: two routes claiming the same page is wrong however the individual
     * expectations were edited.
     */
    const claimed = [await renderSearch(), await renderProfile()]
      .map((page) => headerOf(page).current)
      .filter((current) => current !== undefined);

    expect(new Set(claimed).size).toBe(claimed.length);
  });
});

/**
 * `/profile` LEFT THE COPY SLOT LIST WHEN FEATURE 9 BUILT IT (spec 0010), AND
 * `/search` LEFT IT WHEN FEATURE 11 BUILT IT (spec 0013). Spec 0008's two
 * placeholder sentences are gone from those pages, because each page now IS
 * the thing its sentence was standing in for. `/applications` is still a
 * placeholder and its slot still holds. Both built routes stay in the two
 * checks below, which are about the shape of any route rather than about a
 * placeholder: a built route must still not shout failure at an ordinary
 * state, and must still not say something that becomes false later.
 */
describe("the placeholder routes read as an ordinary state (AC-2)", () => {
  it.each([
    [
      "/applications",
      () => ApplicationsPage(),
      "Every job you apply to will be recorded here, so you can see what you sent and when.",
    ],
  ] as const)(
    "%s renders its copy slot verbatim",
    (_route, render, sentence) => {
      /**
       * The engineer's copy, used verbatim from spec 0008's Copy table. Asserted
       * character for character because `/develop` is forbidden to reword it, and
       * a paraphrase is exactly the change nobody notices in review.
       */
      expect(textOf(render())).toContain(sentence);
    },
  );

  it.each([
    ["/search", renderSearch],
    ["/profile", renderProfile],
    ["/applications", async () => ApplicationsPage()],
  ] as const)("%s renders no failure treatment", async (_route, render) => {
    /**
     * AC-2: a route that is not built yet is an ordinary expected state, not a
     * failure. `role="alert"` here would teach people that the product is broken
     * when it is merely young. `/health` is deliberately excluded: showing
     * failures is its entire job (AC-22).
     */
    const alerts = flatten((await render()) as never).filter(
      (element) =>
        (element.props as { readonly role?: string }).role === "alert",
    );

    expect(alerts).toHaveLength(0);
  });

  it("says nothing that becomes false once the feature lands", async () => {
    /**
     * The trap spec 0007 AC-16 had to delete from the sign in band: copy that
     * was true when written and false for every visitor the moment the feature
     * shipped. A sentence saying a route is not built yet is fine, because it
     * gets replaced. "Coming soon" is not, because it survives as a lie.
     */
    for (const render of [
      renderSearch,
      renderProfile,
      async () => ApplicationsPage(),
    ]) {
      expect(textOf((await render()) as never).toLowerCase()).not.toContain(
        "coming soon",
      );
    }
  });
});

describe("/profile is the only way to reach /applications (AC-1)", () => {
  it("links to it, so no product route is reachable only by typing a URL", async () => {
    const links = flatten((await renderProfile()) as never).filter(
      (element) =>
        (element.props as { readonly href?: string }).href === "/applications",
    );

    expect(links).toHaveLength(1);
    // `COPY-6`, the mock up's own wording.
    expect(textOf(links[0])).toBe("Tracked applications");
  });
});
