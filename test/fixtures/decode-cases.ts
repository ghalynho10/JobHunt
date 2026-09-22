/**
 * Input and expected output pairs for the listing text decoder (spec 0022,
 * Build plan step 1 and step 7).
 *
 * ONE LIST, TWO READERS, and that is the reason it is a file of its own. The
 * TypeScript decoder's unit test (`src/lib/listing-normalize.test.ts`) and the
 * SQL function's parity test (`test/integration/decode-listing-text.test.ts`)
 * both run every case below. Each keeping its own copy would let the two
 * implementations drift apart while each suite stayed green on its own
 * (invariant 4).
 *
 * Written as JavaScript string literals, so `"\\n"` below is the TWO
 * characters backslash and `n`, the shape Adzuna actually sends, and `"\n"` is
 * a real line break. No real posting text: every case is synthetic.
 */
export interface DecodeCase {
  readonly name: string;
  readonly input: string;
  readonly expected: string;
}

export const DECODE_CASES: readonly DecodeCase[] = [
  {
    name: "an escaped newline becomes a line break (the PNC shape)",
    input: "We are hiring.\\nApply today.",
    expected: "We are hiring.\nApply today.",
  },
  {
    name: "escaped carriage return and tab",
    input: "a\\r\\nb\\tc",
    expected: "a\r\nb\tc",
  },
  {
    name: "an escaped quote",
    input: 'the \\"platform\\" team',
    expected: 'the "platform" team',
  },
  {
    name: "backslash, backslash, n is a literal backslash then n, never a newline",
    input: "C:\\\\new",
    expected: "C:\\new",
  },
  {
    name: "&amp;lt; decodes once to &lt;, never to <",
    input: "a &amp;lt; b",
    expected: "a &lt; b",
  },
  {
    name: "all five named entities",
    input: "&amp; &lt; &gt; &quot; &#39;",
    expected: "& < > \" '",
  },
  {
    name: "text with nothing to decode is unchanged",
    input: "Senior Engineer, Platform & Data",
    expected: "Senior Engineer, Platform & Data",
  },
  {
    name: "an unknown backslash sequence is left intact",
    input: "path\\x and \\u00e9",
    expected: "path\\x and \\u00e9",
  },
  {
    name: "an unknown entity is left intact",
    input: "caf&eacute; &#x27;",
    expected: "caf&eacute; &#x27;",
  },
  {
    name: "a lone trailing backslash is left intact",
    input: "ends with \\",
    expected: "ends with \\",
  },
  {
    name: "an empty string stays empty",
    input: "",
    expected: "",
  },
  {
    name: "non ASCII text passes through",
    input: "Zürich — 東京\\n",
    expected: "Zürich — 東京\n",
  },
];

/**
 * Cases where decoding, then trimming, leaves nothing (AC-4). A new listing
 * like this is dropped at the parse; a stored row keeps its original value.
 */
export const DECODES_TO_BLANK: readonly string[] = [
  "\\n",
  "\\n\\t\\r",
  "  \\n  ",
];
