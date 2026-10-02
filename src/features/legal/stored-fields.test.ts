import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  NON_PERSONAL_TABLES,
  PERSONAL_DATA_TABLES,
  STORED_FIELDS,
  fieldsFor,
} from "./stored-fields";

/**
 * The stored field drift guard (spec 0009, AC-2, AC-23).
 *
 * A MIGRATION IS THE ORDINARY EVENT THIS FEATURE HAS TO SURVIVE. Features 9
 * onward each add columns to these tables, and every one of them is a thing the
 * notice claims to list. This test reads
 * `src/lib/supabase/database.types.ts`, which `pnpm db:types` regenerates from
 * the APPLIED schema rather than from a migration file, and fails three ways: a
 * column no entry names, an entry naming a column that is gone, and a table
 * neither list classifies.
 *
 * The third is the one that matters most. A guard that only checked the tables
 * it already knew about would pass happily through the arrival of a whole new
 * table of personal data, which is the case it exists for.
 */

const typesSource = readFileSync(
  fileURLToPath(
    new URL("../../lib/supabase/database.types.ts", import.meta.url),
  ),
  "utf8",
);

/**
 * Every table in the `public` schema and the columns of its `Row` type.
 *
 * The generated file is machine written with stable indentation, so it is read
 * by shape: a table opens at six spaces, its `Row` at eight, and each column at
 * ten. Scoped to the slice between `public: {` and its `Views:` block, because
 * `graphql_public` appears first and the `Insert` and `Update` shapes repeat
 * every column with optional markers.
 */
function schemaTables(): ReadonlyMap<string, readonly string[]> {
  const publicStart = typesSource.indexOf("\n  public: {");
  const viewsStart = typesSource.indexOf("\n    Views: {", publicStart);
  if (publicStart === -1 || viewsStart === -1) {
    throw new Error(
      "Could not locate the public Tables block in database.types.ts. The generator's shape changed: fix this reader rather than deleting the guard.",
    );
  }

  const block = typesSource.slice(publicStart, viewsStart);
  const tables = new Map<string, readonly string[]>();

  for (const match of block.matchAll(
    /^ {6}(\w+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm,
  )) {
    const table = match[1] as string;
    const columns = [...(match[2] as string).matchAll(/^ {10}(\w+):/gm)].map(
      (column) => column[1] as string,
    );
    tables.set(table, columns);
  }

  return tables;
}

const schema = schemaTables();

describe("the reader that parses the generated types", () => {
  /**
   * Everything below compares two sets. A reader that found nothing would make
   * every comparison trivially true, so it is proved to work first, against
   * columns whose absence would be a real schema change rather than a rename.
   */
  it("finds the real tables and their columns, so the guard is not vacuous", () => {
    expect(schema.size).toBeGreaterThan(4);
    expect(schema.get("profile")).toContain("full_name");
    expect(schema.get("application")).toContain("applied_at");
  });

  it("reads the Row shape, not the Insert or Update ones", () => {
    /** `Insert` and `Update` repeat every column, so a wrong block doubles them. */
    const profile = schema.get("profile") ?? [];

    expect(profile).toHaveLength(new Set(profile).size);
  });
});

describe("every table is classified (covers AC-23)", () => {
  it("leaves no table unclassified", () => {
    const classified = new Set([
      ...PERSONAL_DATA_TABLES.map((entry) => entry.table),
      ...NON_PERSONAL_TABLES.map((entry) => entry.table),
    ]);
    const unclassified = [...schema.keys()].filter(
      (table) => !classified.has(table),
    );

    expect(
      unclassified,
      "A new table has to be classified before this suite passes. If it holds personal data, add it to PERSONAL_DATA_TABLES and list its columns; if it does not, say why in NON_PERSONAL_TABLES.",
    ).toEqual([]);
  });

  it("classifies no table that the schema does not have", () => {
    const stale = [
      ...PERSONAL_DATA_TABLES.map((entry) => entry.table),
      ...NON_PERSONAL_TABLES.map((entry) => entry.table),
    ].filter((table) => !schema.has(table));

    expect(stale).toEqual([]);
  });
});

describe("every stored column is named on the notice (covers AC-2, AC-23)", () => {
  it.each(PERSONAL_DATA_TABLES)("names every column of $table", ({ table }) => {
    const columns = schema.get(table) ?? [];
    const named = fieldsFor(table).map((field) => field.column);
    const missing = columns.filter((column) => !named.includes(column));

    expect(
      missing,
      `A migration added ${missing.join(", ")} to ${table}. The privacy notice claims to list everything stored, so add an entry to STORED_FIELDS describing it in plain words.`,
    ).toEqual([]);
  });

  it("names no column that the schema does not have", () => {
    const stale = STORED_FIELDS.filter(
      (field) => !(schema.get(field.table) ?? []).includes(field.column),
    ).map((field) => `${field.table}.${field.column}`);

    expect(stale).toEqual([]);
  });

  it("describes each column exactly once", () => {
    const keys = STORED_FIELDS.map((field) => `${field.table}.${field.column}`);

    expect(keys).toHaveLength(new Set(keys).size);
  });

  it("gives every column plain words, since the page prints them", () => {
    for (const field of STORED_FIELDS) {
      expect(field.describedAs.length).toBeGreaterThan(0);
    }
  });

  /**
   * AC-2 names these two timestamps specifically: when a record was made and
   * last changed is itself personal data, and they are the columns most easily
   * dismissed as plumbing and skipped.
   */
  it("does not skip the created and updated timestamps", () => {
    for (const [table, columns] of schema) {
      if (!PERSONAL_DATA_TABLES.some((entry) => entry.table === table))
        continue;
      const named = fieldsFor(table).map((field) => field.column);

      for (const stamp of ["created_at", "updated_at"]) {
        if (columns.includes(stamp)) expect(named).toContain(stamp);
      }
    }
  });
});

/**
 * The master resume's entry, against its own spec (spec 0024, AC-12).
 *
 * THE CASES ABOVE TAG SPEC 0009 AND PIN ONLY ONE PART OF THIS CRITERION. They
 * prove every column of every table is named, which covers `resume_version`'s
 * five columns generically, but nothing above checks the heading AC-12 chose,
 * where it sits, or that `content` is described as broadly as the column
 * really is. A test tagged with a criterion it only partly pins is how a
 * criterion looks covered when nothing holds it, so this block pins the rest.
 *
 * NOT PINNED HERE, deliberately: AC-12's bump of the privacy notice's
 * effective date. A date carries no rule a test could hold without restating
 * the date itself, so it stays a `/check verify` read of `publication.ts`.
 */
describe("the master resume's entry (spec 0024, AC-12)", () => {
  it("lists resume_version under its own heading, straight after work history", () => {
    // covers: spec 0024 AC-12
    const tables = PERSONAL_DATA_TABLES.map((entry) => entry.table);
    const at = tables.indexOf("resume_version");

    expect(PERSONAL_DATA_TABLES[at]?.heading).toBe("Your resume");
    expect(tables[at - 1]).toBe("work_experience");
  });

  it("names all five of its columns", () => {
    // covers: spec 0024 AC-12
    expect(
      fieldsFor("resume_version")
        .map((field) => field.column)
        .sort(),
    ).toEqual(["content", "created_at", "id", "profile_id", "version_number"]);
  });

  it("describes the text as whatever the reader wrote, contact details included, not a narrower list", () => {
    // covers: spec 0024 AC-12
    const content = fieldsFor("resume_version").find(
      (field) => field.column === "content",
    );

    expect(content?.describedAs).toContain(
      "may include contact details or anything else you chose to type",
    );
  });
});
