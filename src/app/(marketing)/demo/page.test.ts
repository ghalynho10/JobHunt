import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { failure, success } from "@/lib/result";
import { DEMO_COPY } from "@/features/demo/copy";
import { DEMO_PERSONAS } from "@/features/demo/personas";

import {
  renderDeepAsync,
  textOf,
} from "../../../../test/helpers/react-element";

/**
 * Where `/demo`'s two candidate profiles come from (spec 0021, verify.md's
 * **Value sourcing** row "The switcher links and both profiles").
 *
 * THE CLAIM IS THAT THEY ARE A CONSTANT, NOT A READ. `personas.ts` says so in
 * prose and the page's own imports agree, but nothing failed if that stopped
 * being true: a later change that moved a label, a skill or a summary into
 * `demo_result` would render an identical looking page while adding a third
 * way for it to come back empty. The verify step asked a person to edit a skill
 * in `personas.ts`, reload and look. This file does that edit mechanically.
 *
 * THE DATABASE READ IS REPLACED, AND THE SHARP CASE IS THE ONE WHERE IT FAILS.
 * If the candidates still render in full while `readDemoPage()` returns a
 * `Failure`, they cannot be coming from it. That is a structural proof rather
 * than an inspection of imports, and it is the same argument AC-12 makes about
 * the page: a failed read must not take the disclosure down with it, because
 * the disclosure is what makes everything else on the page checkable.
 *
 * `readDemoPage()`'s own real behaviour against the real database is not this
 * file's subject and is not proved here.
 */

const readDemoPage = vi.hoisted(() => vi.fn());

vi.mock("@/features/demo/queries", () => ({ readDemoPage }));

const { default: DemoPage } = await import("./page");

/** The AC-15 state: a successful read, no refresh has ever run. */
function neverRefreshed() {
  return success({
    results: [],
    refresh: {
      searchTitles: ["backend engineer", "frontend engineer"] as const,
      searchLocation: undefined,
      refreshedAt: undefined,
    },
  });
}

/** The AC-12 state: the read itself did not come back. */
function readFailed() {
  return failure({
    kind: "database_unavailable",
    severity: "unexpected",
    message: "The demo read failed, on purpose, inside a test.",
  });
}

/** The whole page, rendered for one `?persona=` value. */
async function render(persona?: string): Promise<ReactNode> {
  return renderDeepAsync(
    (await DemoPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(persona === undefined ? {} : { persona }),
    })) as never,
  );
}

beforeEach(() => {
  readDemoPage.mockReset();
  readDemoPage.mockResolvedValue(neverRefreshed());
});

describe("the persona literals survive a failed database read (AC-12)", () => {
  it("still names both candidates in the switcher", async () => {
    readDemoPage.mockResolvedValue(readFailed());

    const text = textOf(await render());

    for (const persona of DEMO_PERSONAS) {
      expect(text).toContain(persona.label);
    }
  });

  it("still renders every skill of both candidates", async () => {
    readDemoPage.mockResolvedValue(readFailed());

    const text = textOf(await render());

    for (const persona of DEMO_PERSONAS) {
      for (const skill of persona.profile.skills) {
        expect(text).toContain(skill);
      }
    }
  });

  it("still renders both summaries and every work history entry", async () => {
    readDemoPage.mockResolvedValue(readFailed());

    const text = textOf(await render());

    for (const persona of DEMO_PERSONAS) {
      const { summary, experience } = persona.profile;

      if (summary !== undefined) expect(text).toContain(summary);

      for (const entry of experience) {
        expect(text).toContain(`${entry.title} · ${entry.company}`);
      }
    }
  });

  it("shows the failure sentence beside them, not instead of them", async () => {
    readDemoPage.mockResolvedValue(readFailed());

    const text = textOf(await render());

    /**
     * BOTH, IN THE SAME RENDER. A page that swapped the disclosure for the
     * failure notice would pass a test that only looked for the notice, and it
     * would be the version that tells a reader least when something is wrong.
     */
    expect(text).toContain(DEMO_COPY.readFailed);
    expect(text).toContain(DEMO_COPY.profilesHeading);
  });
});

describe("the page reads the database exactly once, for results only", () => {
  it("calls readDemoPage once per render, with the active slug", async () => {
    await render("frontend-engineer");

    expect(readDemoPage).toHaveBeenCalledTimes(1);
    expect(readDemoPage).toHaveBeenCalledWith("frontend-engineer");
  });

  it("does not read again for the second candidate's profile", async () => {
    /**
     * TWO PROFILES RENDER ON EVERY REQUEST (AC-14) WHILE ONE SLUG IS ACTIVE.
     * A second read here would be the shape the constant exists to avoid: the
     * page would need the database to say who the other candidate is.
     */
    await render("backend-engineer");

    expect(readDemoPage).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default slug without asking the database", async () => {
    await render("not-a-real-persona");

    expect(readDemoPage).toHaveBeenCalledTimes(1);
    expect(readDemoPage).toHaveBeenCalledWith("backend-engineer");
  });
});

describe("editing personas.ts changes the page", () => {
  /**
   * THE VERIFY STEP, RUN MECHANICALLY. Every assertion above derives its
   * expectation from `DEMO_PERSONAS`, so all of them would still pass if the
   * page had the same strings typed into its own JSX. Replacing the module with
   * an edited copy is what separates "the page reads the constant" from "the
   * page happens to agree with it today".
   *
   * IT COMPARES TWO WHOLE RENDERS RATHER THAN HUNTING FOR THE REMOVED SKILL.
   * Most of these skill names also appear inside a work history description
   * ("a Kubernetes microservices platform in Go"), so asserting that a replaced
   * name is absent would fail on a page that is behaving perfectly. The
   * edited name is a word that appears nowhere on the page in either render,
   * which is what makes its arrival unambiguous.
   */
  it("renders a skill edited into the constant, and did not before", async () => {
    const edited = "Sourdough";

    const before = textOf(await render());

    expect(before).not.toContain(edited);

    vi.resetModules();

    const actual = await vi.importActual<
      typeof import("@/features/demo/personas")
    >("@/features/demo/personas");

    const [first, ...rest] = actual.DEMO_PERSONAS;

    if (first === undefined) throw new Error("There are no demo personas.");

    vi.doMock("@/features/demo/personas", () => ({
      ...actual,
      DEMO_PERSONAS: [
        {
          ...first,
          label: "Edited candidate",
          profile: {
            ...first.profile,
            skills: [edited, ...first.profile.skills.slice(1)],
          },
        },
        ...rest,
      ],
    }));

    const { default: EditedPage } = await import("./page");
    const after = textOf(
      await renderDeepAsync(
        (await EditedPage({
          params: Promise.resolve({}),
          searchParams: Promise.resolve({}),
        })) as never,
      ),
    );

    vi.doUnmock("@/features/demo/personas");
    vi.resetModules();

    expect(after).toContain(edited);
    expect(after).toContain("Edited candidate");
    expect(after).not.toBe(before);
  });
});
