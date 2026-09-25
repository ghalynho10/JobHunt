/**
 * The two numeric limits the chip fields and `schemas.ts` both enforce (spec
 * 0023, AC-6, Feature design).
 *
 * THIS FILE MUST STAY IMPORT FREE. `schemas.ts` is server only (`queries.ts`
 * carries `import "server-only"`, and every other current importer of
 * `schemas.ts` is server code too), while `chip-field.tsx` and
 * `preferences-form.tsx` are client. Importing `schemas.ts` from either would
 * pull `zod` and `./calendar` into the client bundle for two integers. A
 * separate, import free module is what lets both sides import the same two
 * numbers with nothing else attached, and staying import free is the property
 * that must hold for that to keep being true.
 */

/** The per value character cap, shared by all three list fields. */
export const LIST_VALUE_MAX_LENGTH = 100;

/** The value count cap, `desired_titles` and `desired_locations` only. */
export const PREFERENCE_LIST_MAX_COUNT = 50;
