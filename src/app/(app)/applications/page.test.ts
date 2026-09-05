import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success } from "@/lib/result";
import type { ApplicationRow } from "@/features/applications/queries";

import {
  flatten,
  renderDeepAsync,
  textOf,
} from "../../../../test/helpers/react-element";

/**
 * The applications page's four states (spec 0014, AC-3, AC-8, AC-11, AC-17).
 *
 * WHY THE STATES ARE TESTED TOGETHER. The requirement is not that each renders;
 * it is that a reader can TELL THEM APART. An empty list, a failed read, a list
 * of records and a removal confirmation are four different things that have
 * happened, and the first two are the pair most easily collapsed: rendering an
 * empty page on a failed read would silently claim the reader has applied to
 * nothing.
 */

const readApplications = vi.fn();

vi.mock("@/features/applications/queries", () => ({ readApplications }));

const { default: ApplicationsPage } = await import("./page");
const { RemoveForm } = await import("@/features/applications/remove-form");

function row(over: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    id: "3f7d9c31-1111-4000-8000-000000000000",
    sourceJobId: "111",
    title: "Software Engineer",
    companyName: "Acme",
    location: "Boston",
    url: "https://www.adzuna.com/land/ad/111",
    descriptionSnippet: "A snippet.",
    salaryMin: 100000,
    salaryMax: 120000,
    salaryCurrency: "USD",
    salaryIsPredicted: false,
    postedAt: "2026-09-01T12:00:00Z",
    appliedAt: "2026-09-05T09:00:00Z",
    ...over,
  };
}

async function render(
  params: Record<string, string | string[] | undefined> = {},
) {
  return renderDeepAsync(
    (await ApplicationsPage({
      searchParams: Promise.resolve(params),
    })) as never,
    /**
     * `RemoveForm` is stopped at rather than invoked: it is a Client Component
     * calling `useActionState`, which has no React runtime in the unit
     * project's `node` environment. What matters here is the props this page
     * hands it, which is what the confirmation question is built from.
     */
    [RemoveForm],
  );
}

function alerts(tree: unknown) {
  return flatten(tree as never).filter(
    (element) => (element.props as { role?: string }).role === "alert",
  );
}

beforeEach(() => {
  readApplications.mockReset();
});

describe("the empty state has a way out (AC-17)", () => {
  beforeEach(() => {
    readApplications.mockResolvedValue(success([]));
  });

  it("keeps the promise sentence it has carried since feature 32", () => {
    /**
     * The sentence was live on production with nothing behind it. It stays
     * rather than being rewritten, because it always described what the page
     * would hold rather than apologising for being empty, so it reads correctly
     * now that rows land here.
     */
    return render().then((tree) => {
      expect(textOf(tree)).toContain(
        "Every job you apply to will be recorded here, so you can see what you sent and when.",
      );
    });
  });

  it("offers a link to search rather than leaving a dead end", async () => {
    expect(textOf(await render())).toContain("Search for jobs");
  });

  it("shouts no failure at an ordinary empty page", async () => {
    /**
     * Having applied to nothing yet is not a failure, and `role="alert"` here
     * would teach people the product is broken when it is merely new. The same
     * convention `/search` uses for a search that legitimately matched nothing.
     */
    expect(alerts(await render())).toHaveLength(0);
  });
});

describe("a failed read is never rendered as an empty list (AC-3)", () => {
  it("says what happened, in an alert", async () => {
    /**
     * THE PAIR THIS FILE EXISTS FOR. An empty page and a failed read look
     * identical unless the failure says so, and rendering the first for the
     * second would claim the reader has applied to nothing. That is the default
     * that reads like success `AGENTS.md` forbids, and the exact shape a fresh
     * model review caught on `/search` on 2026-09-04.
     */
    readApplications.mockResolvedValue(
      failure({
        kind: "database_unavailable",
        severity: "unexpected",
        message: "Something went wrong on our side. Try again in a moment.",
      }),
    );

    const tree = await render();

    expect(alerts(tree)).toHaveLength(1);
    expect(textOf(tree)).toContain("Something went wrong on our side");
    /** And it does NOT offer the empty state's way out, which would be a lie. */
    expect(textOf(tree)).not.toContain("Search for jobs");
  });
});

describe("the list (AC-8, AC-18)", () => {
  it("renders one card per recorded application", async () => {
    readApplications.mockResolvedValue(
      success([
        row({ id: "a", sourceJobId: "1", title: "First Job" }),
        row({ id: "b", sourceJobId: "2", title: "Second Job" }),
      ]),
    );

    const text = textOf(await render());

    expect(text).toContain("First Job");
    expect(text).toContain("Second Job");
  });

  it("shows no attribution at all when there is nothing to attribute (AC-8)", async () => {
    /**
     * Attribution is per displayed advert, never per screen (spec 0013,
     * invariant 4). A page with no rows displays no advert, so it owes nothing.
     */
    readApplications.mockResolvedValue(success([]));

    expect(textOf(await render())).not.toContain("Jobs");
  });
});

describe("the removal confirmation (AC-11)", () => {
  beforeEach(() => {
    readApplications.mockResolvedValue(success([row()]));
  });

  it("hands the confirmation the job it is about, not just an id", async () => {
    /**
     * `COPY-4` names the job, because a bare "are you sure" beside a list of
     * applications does not tell anybody which one is about to go (spec 0010
     * AC-8 set this precedent). The sentence itself is built inside
     * `RemoveForm` from these props and is covered by `copy.test.ts`.
     */
    const tree = await render({
      remove: "3f7d9c31-1111-4000-8000-000000000000",
    });

    const form = flatten(tree as never).find(
      (element) => element.type === RemoveForm,
    );

    expect(form?.props).toMatchObject({
      applicationId: "3f7d9c31-1111-4000-8000-000000000000",
      title: "Software Engineer",
      companyName: "Acme",
    });
  });

  it("shows the list unchanged when the id matches nothing", async () => {
    /**
     * A crafted or stale `?remove=` must not blank the page or throw. Falling
     * back to the ordinary list is the harmless direction.
     */
    const tree = await render({ remove: "not-a-real-id" });

    expect(textOf(tree)).toContain("Software Engineer");
    expect(
      flatten(tree as never).some((element) => element.type === RemoveForm),
    ).toBe(false);
  });

  it("takes only the first value when the parameter is repeated", async () => {
    /**
     * The same handling `/search` uses: a crafted `?remove=a&remove=b` cannot
     * smuggle a second value into the lookup.
     */
    const tree = await render({
      remove: ["3f7d9c31-1111-4000-8000-000000000000", "other"],
    });

    expect(
      flatten(tree as never).some((element) => element.type === RemoveForm),
    ).toBe(true);
  });
});
