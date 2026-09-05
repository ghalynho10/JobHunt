/**
 * What each external service declares about where its credentials travel
 * (spec 0004, AC-13).
 *
 * Redaction is an ALLOW LIST for headers and a DENY LIST for the rest, and both
 * halves are deliberate. Headers are the wide open surface: a service can send
 * back anything, and a new one appearing later must not be captured just
 * because nobody thought to add it to a block list. Query parameters and body
 * fields are the narrow, service specific surface, so those are named.
 *
 * A service whose credential travels somewhere unusual needs its own
 * declaration here. That is the cost of owning the recorder rather than taking
 * one off the shelf, and it is named in spec 0004's consequences.
 */

export interface ServiceDeclaration {
  /** The folder under `test/fixtures/` that holds this service's recordings. */
  readonly name: string;
  /**
   * Header names kept verbatim, lowercased. EVERY other header keeps its name
   * and loses its value. The name is worth keeping: knowing a `set-cookie` came
   * back is useful, and its value is exactly what must not be committed.
   */
  readonly keepHeaders: readonly string[];
  /** Query parameters whose value is a credential. */
  readonly secretQueryParams: readonly string[];
  /** Top level body fields whose value is a credential. */
  readonly secretBodyFields: readonly string[];
}

/**
 * Headers safe on any service: they describe the shape and caching of a
 * response and never carry a credential. Anything not listed is redacted, so
 * forgetting to think about a header fails safe.
 */
const COMMON_SAFE_HEADERS = [
  "content-type",
  /**
   * `content-length` is deliberately NOT here. A response is usually compressed
   * on the wire, and `fetch` hands back the DECODED body, so the length the
   * service sent describes bytes that are not the bytes this store holds. Kept
   * verbatim it would be a real number that is quietly wrong about the thing
   * beside it, which is worse for the next reader than an honest placeholder.
   * `content-encoding` is redacted for the same reason.
   */
  "cache-control",
  "etag",
  "last-modified",
  "vary",
  "date",
] as const;

/**
 * GitHub's public REST API, spec 0004's stand in for a real external service.
 *
 * Chosen because it is genuinely external, free, needs no credential, is about
 * as stable as anything on the internet, and answers with a real header set
 * including rate limit and caching headers. That last point is why it is here:
 * the redaction in AC-13 is exercised against REAL headers rather than invented
 * ones. Adzuna (feature 11) and the model router (feature 13) record their own
 * fixtures later, using this same recorder.
 */
export const GITHUB: ServiceDeclaration = {
  name: "github",
  keepHeaders: [
    ...COMMON_SAFE_HEADERS,
    // Kept on purpose: a recorded rate limit header is the sort of thing a
    // later feature will want to parse, and none of them is a secret.
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-used",
    "x-ratelimit-resource",
  ],
  secretQueryParams: [],
  secretBodyFields: [],
};

/**
 * Adzuna's job search API, this product's real listing source (spec 0013).
 *
 * BOTH CREDENTIALS TRAVEL IN THE QUERY STRING, which is why they are named
 * here: `searchListings()` puts `app_id` and `app_key` on the URL, so an
 * unredacted recording would commit a live credential pair to git in the
 * `recordedFrom.url` field. `redactUrl()` blanks them at write time, before
 * anything reaches disk.
 *
 * Adzuna's response body carries no credential of its own, so
 * `secretBodyFields` is empty and bodies are stored verbatim. That is
 * deliberate and is the whole value of the fixture: the committed file is
 * exactly the bytes Adzuna sent, including the quirks a hand written mock
 * would smooth over. One of those quirks is already load bearing, see
 * `src/features/search/adzuna.ts`: `salary_is_predicted` arrives as the
 * STRING `"1"`, while Adzuna's own documented example shows the number `0`.
 */
export const ADZUNA: ServiceDeclaration = {
  name: "adzuna",
  keepHeaders: [...COMMON_SAFE_HEADERS],
  secretQueryParams: ["app_id", "app_key"],
  secretBodyFields: [],
};

/**
 * A service that carries credentials in every way one can, used by the
 * redaction test. It is a declaration rather than a real service because AC-13
 * has to prove the redaction against a request that genuinely carries an API
 * key, a bearer token and a `set-cookie`, and no real service should ever be
 * asked to hand those over just to prove a point.
 */
export const CREDENTIAL_CARRYING: ServiceDeclaration = {
  name: "credential-carrying",
  keepHeaders: [...COMMON_SAFE_HEADERS],
  secretQueryParams: ["api_key", "app_key"],
  secretBodyFields: ["password", "refresh_token"],
};
