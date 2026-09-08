import { createHash } from "node:crypto";

import { BANDS, type Band } from "../rubric";

/**
 * A short, stable fingerprint of the band anchor wording (spec 0017, AC-9).
 *
 * WHAT IT IS FOR. Every eval report records this alongside the model id, so a
 * report read three weeks later can tell "the scorer changed" apart from "the
 * rubric changed". Those are the two explanations for a band moving, and
 * without this field a reader has no way to separate them after the fact.
 *
 * ONE FUNCTION, TWO CALLERS, ON PURPOSE. The report writer
 * (`test/eval/report.ts`) and the drift test (`band-anchors.test.ts`, AC-10)
 * both call this. AC-9 asks for the hash to be computed "the same way" in both
 * places, and a shared function makes that true by construction instead of by
 * two implementations that happen to agree today.
 *
 * IT ITERATES `BANDS` RATHER THAN `Object.keys(anchors)`. `BANDS` is the
 * declared band order (`rubric.ts`), so the digest cannot change because a key
 * was moved in the object literal. Only the anchor TEXT moving changes it,
 * which is the only thing this is meant to detect. The band name is folded in
 * beside its text so swapping two bands' wording is a change too.
 *
 * TWELVE HEX CHARACTERS, NOT THE WHOLE DIGEST. This is a human readable
 * change marker in a report a person reads, not a security boundary; nothing
 * here defends against someone crafting a collision on purpose.
 *
 * @param anchors The anchor map, normally `BAND_ANCHORS` from `rubric.ts`.
 * @returns The first 12 hex characters of the sha256 over band and text.
 */
export function bandAnchorsHash(anchors: Readonly<Record<Band, string>>) {
  const canonical = BANDS.map((band) => `${band}:${anchors[band]}`).join("\n");

  return createHash("sha256")
    .update(canonical, "utf8")
    .digest("hex")
    .slice(0, 12);
}
