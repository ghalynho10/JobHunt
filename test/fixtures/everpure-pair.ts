import type { DedupFields } from "@/lib/listing-dedup";

/**
 * The Everpure, Inc. pair from `/demo`'s first real refresh (spec 0022, AC-2).
 *
 * The ids and titles are the real ones Adzuna returned on 2026-09-16. They were
 * first read as one job listed twice, and are most likely two distinct roles:
 * their identical snippets are the company's own introduction, which every
 * stored snippet in that batch was (spec 0021, rationale lines 231 to 233).
 *
 * THE LOCATION IS THE SAME FOR BOTH, AND DELIBERATELY. The real location was
 * never recorded. Making it equal is the harder case for a dedup key: company
 * and location then agree, and only the title keeps the two roles apart. A key
 * that passes here passes with any location.
 *
 * Shared by `/search`'s dedup test and `/demo`'s walk test, so the two screens
 * are proven against the same pair (invariant 5).
 */
export const EVERPURE_PAIR = [
  {
    source: "adzuna",
    sourceJobId: "5883839578",
    companyName: "Everpure, Inc.",
    title: "Software Engineering Manager, Platform",
    location: "Mountain View, Santa Clara County",
  },
  {
    source: "adzuna",
    sourceJobId: "5883870504",
    companyName: "Everpure, Inc.",
    title: "Software Engineer",
    location: "Mountain View, Santa Clara County",
  },
] as const satisfies readonly DedupFields[];
