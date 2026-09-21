import { afterAll, describe, expect, it } from "vitest";

import { decodeListingText } from "@/lib/listing-normalize";

import { queryAsSuperuser } from "../helpers/database";
import { deleteFixtureUser, mintFixtureUser } from "../helpers/fixture-user";
import { DECODE_CASES, DECODES_TO_BLANK } from "../fixtures/decode-cases";

/**
 * The SQL decode function against its TypeScript twin, in the real database
 * (spec 0022, AC-7, invariants 4 and 7).
 *
 * WHY THROUGH THE DIRECT CONNECTION. The function is granted to no Data API
 * role on purpose, so no Supabase client can call it, which is the property
 * the last block below proves. `test/helpers/database.ts` is the one path that
 * reaches it, the same reason that helper exists for spec 0007's hook.
 *
 * PARITY IS ASSERTED, NOT INSPECTED. Every shared case runs through both
 * implementations and the two outputs are compared byte for byte, so a token
 * added to one side alone fails here even while each side's own test passes.
 */

const CONTEXT = { sourceJobId: "parity", field: "description" } as const;

async function sqlDecode(
  input: string | null,
  retrim = false,
): Promise<string | null> {
  const rows = await queryAsSuperuser<{ decoded: string | null }>(
    "select public.decode_listing_text($1, $2) as decoded",
    [input, retrim],
  );
  return rows[0]?.decoded ?? null;
}

const mintedUserIds: string[] = [];

afterAll(async () => {
  for (const id of mintedUserIds) await deleteFixtureUser(id);
});

describe("the SQL function matches decodeListingText() on every shared case (invariant 4)", () => {
  for (const testCase of DECODE_CASES) {
    it(testCase.name, async () => {
      const typescript = decodeListingText(testCase.input, CONTEXT);

      expect(await sqlDecode(testCase.input)).toBe(typescript);
      // And both are the answer the case states, so agreeing on a wrong
      // output cannot pass.
      expect(typescript).toBe(testCase.expected);
    });
  }
});

describe("the second trim on title and company (AC-4, AC-7)", () => {
  it("trims a decoded edge the way JavaScript's trim() does", async () => {
    const input = "\\n\u00a0Platform Engineer\u3000\\t";

    expect(await sqlDecode(input, true)).toBe(
      decodeListingText(input, CONTEXT).trim(),
    );
    expect(await sqlDecode(input, true)).toBe("Platform Engineer");
  });

  for (const input of DECODES_TO_BLANK) {
    it(`keeps ${JSON.stringify(input)} unchanged rather than storing an empty value`, async () => {
      // The TypeScript side drops such a listing at the parse; a stored row
      // cannot be dropped, so it is left exactly as it was.
      expect(decodeListingText(input, CONTEXT).trim()).toBe("");
      expect(await sqlDecode(input, true)).toBe(input);
    });
  }

  it("does not trim when retrim is off, matching location and description", async () => {
    expect(await sqlDecode("\\nBoston\\n")).toBe("\nBoston\n");
  });

  it("leaves a null column null", async () => {
    expect(await sqlDecode(null)).toBeNull();
    expect(await sqlDecode(null, true)).toBeNull();
  });
});

describe("the backfill statement over real application rows (AC-7)", () => {
  /**
   * THE SAME STATEMENT THE MIGRATION RUNS, narrowed to this test's two rows by
   * id. Running it unnarrowed would rewrite rows other integration files are
   * using in parallel. Keep this in step with the `update` at the foot of
   * `supabase/migrations/20260921120000_decode_listing_text.sql`.
   */
  const BACKFILL = `
    update public.application
    set
      job_title = public.decode_listing_text(job_title, true),
      company_name = public.decode_listing_text(company_name, true),
      job_location = public.decode_listing_text(job_location),
      job_description = public.decode_listing_text(job_description)
    where id = any($1::uuid[])
      and exists (
        select 1
        from pg_catalog.unnest(
          array[job_title, company_name, job_location, job_description]
        ) as field (value)
        where field.value ~ '\\\\n|\\\\r|\\\\t|\\\\"|\\\\\\\\|&amp;|&lt;|&gt;|&quot;|&#39;'
      )`;

  interface Row {
    readonly id: string;
    readonly job_title: string;
    readonly company_name: string;
    readonly job_location: string | null;
    readonly job_description: string | null;
    readonly updated_at: string;
  }

  async function seedRow(
    profileId: string,
    sourceJobId: string,
    fields: Omit<Row, "id" | "updated_at">,
  ): Promise<string> {
    const rows = await queryAsSuperuser<{ id: string }>(
      `insert into public.application
         (profile_id, source, source_job_id, job_title, company_name,
          job_location, job_url, job_description)
       values ($1, 'adzuna', $2, $3, $4, $5, 'https://www.adzuna.com/land/ad/1', $6)
       returning id`,
      [
        profileId,
        sourceJobId,
        fields.job_title,
        fields.company_name,
        fields.job_location,
        fields.job_description,
      ],
    );
    const id = rows[0]?.id;
    if (id === undefined) throw new Error("Could not seed an application row.");
    return id;
  }

  async function readRows(ids: readonly string[]): Promise<readonly Row[]> {
    return queryAsSuperuser<Row>(
      `select id, job_title, company_name, job_location, job_description,
              updated_at::text
         from public.application where id = any($1::uuid[]) order by id`,
      [ids],
    );
  }

  it("decodes a broken row in all four columns and leaves a clean row byte identical", async () => {
    const user = await mintFixtureUser("decode-backfill");
    mintedUserIds.push(user.id);
    await queryAsSuperuser(
      "insert into public.profile (id, full_name) values ($1, 'Backfill Fixture')",
      [user.id],
    );

    const broken = await seedRow(user.id, "broken", {
      job_title: "\\nPlatform Engineer",
      company_name: "R&amp;D Labs",
      job_location: "Boston\\tMA",
      job_description: "About us.\\nC:\\\\new &amp;lt;",
    });
    const clean = await seedRow(user.id, "clean", {
      job_title: "Backend Engineer",
      company_name: "Acme & Co",
      job_location: null,
      job_description: "Plain text, a lone \\ backslash.",
    });

    const before = await readRows([broken, clean]);
    // Counted over this test's own user: other integration files insert
    // `application` rows in parallel, so a table wide count races them.
    const countBefore = await queryAsSuperuser<{ count: string }>(
      "select count(*)::text as count from public.application where profile_id = $1",
      [user.id],
    );

    await queryAsSuperuser(BACKFILL, [[broken, clean]]);

    const after = await readRows([broken, clean]);
    const countAfter = await queryAsSuperuser<{ count: string }>(
      "select count(*)::text as count from public.application where profile_id = $1",
      [user.id],
    );

    expect(after.find((row) => row.id === broken)).toMatchObject({
      job_title: "Platform Engineer",
      company_name: "R&D Labs",
      job_location: "Boston\tMA",
      job_description: "About us.\nC:\\new &lt;",
    });
    // Byte identical, `updated_at` included: the row was never written.
    expect(after.find((row) => row.id === clean)).toEqual(
      before.find((row) => row.id === clean),
    );
    expect(countAfter[0]?.count).toBe(countBefore[0]?.count);
  });

  it("keeps a title that would decode to nothing, rather than failing the whole update", async () => {
    const user = await mintFixtureUser("decode-blank");
    mintedUserIds.push(user.id);
    await queryAsSuperuser(
      "insert into public.profile (id, full_name) values ($1, 'Blank Fixture')",
      [user.id],
    );

    const blank = await seedRow(user.id, "blank", {
      job_title: "\\n",
      company_name: "Acme\\n",
      job_location: null,
      job_description: null,
    });

    await queryAsSuperuser(BACKFILL, [[blank]]);

    const [row] = await readRows([blank]);
    expect(row?.job_title).toBe("\\n");
    expect(row?.company_name).toBe("Acme");
  });
});

describe("no Data API role can call the function (invariant 7)", () => {
  for (const role of ["anon", "authenticated", "service_role"] as const) {
    it(`refuses ${role}`, async () => {
      const rows = await queryAsSuperuser<{ allowed: boolean }>(
        "select has_function_privilege($1, 'public.decode_listing_text(text, boolean)', 'execute') as allowed",
        [role],
      );
      expect(rows[0]?.allowed).toBe(false);
    });
  }
});
