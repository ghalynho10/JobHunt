/**
 * Input and expected output pairs for line break normalisation (spec 0025,
 * AC-5, invariant 1).
 *
 * ONE LIST, TWO READERS, the same reason `decode-cases.ts` is a file of its
 * own. `normalizeLineBreaks()`'s unit test (`src/lib/line-breaks.test.ts`) and
 * `public.normalize_line_breaks()`'s parity test
 * (`test/integration/normalize-line-breaks.test.ts`) both run every case below,
 * so the two implementations cannot drift apart while each suite stays green.
 *
 * THE LONE `\r` CASES ARE REQUIRED, NOT OPTIONAL (invariant 1). A `\r\n` only
 * set passes even when the SQL side forgets its second `replace`, which is the
 * one mistake the two implementations are most likely to differ on.
 *
 * Written as JavaScript string literals, so `"\r\n"` is a real carriage return
 * and newline. No real personal data: every case is synthetic.
 */
export interface LineBreakCase {
  readonly name: string;
  readonly input: string;
  readonly expected: string;
}

export const LINE_BREAK_CASES: readonly LineBreakCase[] = [
  {
    name: "a carriage return and newline pair becomes a newline",
    input: "First line\r\nSecond line",
    expected: "First line\nSecond line",
  },
  {
    name: "a lone carriage return becomes a newline",
    input: "First line\rSecond line",
    expected: "First line\nSecond line",
  },
  {
    name: "a lone newline is left unchanged",
    input: "First line\nSecond line",
    expected: "First line\nSecond line",
  },
  {
    name: "consecutive pairs each become one newline",
    input: "Para one\r\n\r\nPara two",
    expected: "Para one\n\nPara two",
  },
  {
    name: "a carriage return before a pair is two breaks, not one",
    input: "a\r\r\nb",
    expected: "a\n\nb",
  },
  {
    name: "a newline before a carriage return is two breaks",
    input: "a\n\rb",
    expected: "a\n\nb",
  },
  {
    name: "a break at the very start",
    input: "\r\nStarts with a break",
    expected: "\nStarts with a break",
  },
  {
    name: "a break at the very end",
    input: "Ends with a break\r",
    expected: "Ends with a break\n",
  },
  {
    name: "text with no break at all",
    input: "Just one line, nothing to change.",
    expected: "Just one line, nothing to change.",
  },
  {
    /**
     * AC-5's "changes nothing else": a tab, the Unicode line and next line
     * separators, an accented letter and an emoji are not carriage returns,
     * so neither implementation may touch them.
     */
    name: "other whitespace and characters are left unchanged",
    input: "a\tb c\u0085d é 🚀",
    expected: "a\tb c\u0085d é 🚀",
  },
  {
    name: "the empty string",
    input: "",
    expected: "",
  },
];
