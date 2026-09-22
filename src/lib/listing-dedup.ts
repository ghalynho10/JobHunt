/**
 * Collapsing the same job returned under two ids (spec 0022, AC-1, AC-2,
 * AC-3, AC-8).
 *
 * WHY THIS LIVES IN `src/lib`. `/search` and `/demo` must agree on what a
 * duplicate is, or the same pair of Adzuna ids would be one result on one
 * screen and two on the other (invariant 5). Both call `listingDedupKey()`
 * from here, and neither keeps its own copy.
 *
 * CONSERVATIVE ON PURPOSE. The key is company, title and location, all three
 * equal after normalising, and nothing looser. A real duplicate whose title
 * the source reworded by one word still shows twice, which is the accepted
 * cost: no confirmed duplicate has been seen on real data to tune a looser key
 * against, and a key that merges too eagerly hides a real role silently, the
 * one failure this feature exists to prevent (spec 0022, Consequences).
 */

/**
 * What the key reads, and nothing more. A `Listing` satisfies it structurally,
 * so this module never imports from a feature.
 */
export interface DedupFields {
  readonly source: string;
  readonly sourceJobId: string;
  readonly companyName: string;
  readonly title: string;
  readonly location: string | undefined;
}

/** Case folded, trimmed, and every run of whitespace made one space (AC-1). */
function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * The grouping key two listings must share to collapse.
 *
 * A BLANK LOCATION IS NEVER A POINT OF AGREEMENT (invariant 2). Without a real
 * location the key takes the listing's own `source` and `sourceJobId` instead,
 * so two DIFFERENT listings that both lack one never collide, while the SAME
 * listing always gives the same key. That second half is what `/demo`'s walk
 * needs, since it must still recognise one listing returned by both of its
 * searches (AC-8). A fresh random value per call would satisfy the first half
 * and break the second.
 *
 * Built with `JSON.stringify` rather than a joining character, so no company
 * or title can contain a separator that makes two different triples read as
 * one, and the leading tag keeps the two forms from ever matching each other.
 */
export function listingDedupKey(listing: DedupFields): string {
  const companyName = normalize(listing.companyName);
  const title = normalize(listing.title);
  const location =
    listing.location === undefined ? "" : normalize(listing.location);

  return location === ""
    ? JSON.stringify([
        "own",
        companyName,
        title,
        listing.source,
        listing.sourceJobId,
      ])
    : JSON.stringify(["shared", companyName, title, location]);
}

/**
 * One listing per key, in Adzuna's own order (AC-1, AC-3).
 *
 * WHICH ID A GROUP KEEPS. When the caller applied to one or more ids in the
 * group, the earliest of those in Adzuna's order, so the card, its posting
 * link and its apply control all name the id an `application` row already
 * names. Otherwise the first occurrence. A group sits at the position of its
 * first occurrence, whichever id represents it.
 *
 * WHEN THE APPLIED READ FAILED, `appliedIds` is `undefined` and every group
 * keeps its first occurrence. A sibling of an applied id can then show as not
 * applied, which the page's existing `COPY-8` alert discloses rather than
 * hides (spec 0022, invariant 6).
 *
 * Never turns a non empty list into an empty one: every group keeps exactly
 * one member.
 */
export function dedupeListings<T extends DedupFields>(
  listings: readonly T[],
  appliedIds: ReadonlySet<string> | undefined,
): readonly T[] {
  /**
   * `Map.groupBy` keeps keys in first occurrence order and each group's
   * members in Adzuna's order, which are exactly the two orders the rules above
   * rely on: a group's position, and "earliest applied id" within it. It builds
   * one new map without touching `listings`.
   */
  const groups = Map.groupBy(listings, listingDedupKey);

  return [...groups.values()].flatMap((members) => {
    const applied = members.find((member) =>
      appliedIds?.has(member.sourceJobId),
    );
    const kept = applied ?? members[0];
    return kept === undefined ? [] : [kept];
  });
}
