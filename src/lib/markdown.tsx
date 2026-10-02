import type { ComponentProps, ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * The shared markdown renderer (spec 0024, AC-13, invariant 5).
 *
 * IN `src/lib`, NOT `src/components/ui`. It is shared logic three features use
 * (the master resume now, resume tailoring and resume upload later, spec 0024
 * Follow-up), and `src/components/ui/AGENTS.md` defines that directory as spec
 * 0005's design system, which a markdown pipeline is not.
 *
 * SAFE BY CONSTRUCTION, AND THE CALLER CANNOT UNDO IT. The stored resume is free
 * text the reader controls entirely and is never sanitised at write time (the
 * project stores values raw), so every display safety rule lives here:
 *
 * 1. NO RAW HTML. `rehype-raw` is never added, so react-markdown turns any HTML
 *    typed into the source into plain text rather than into elements. A
 *    `<script>` arrives on the page as the visible characters `<script>`.
 * 2. NO UNSAFE LINK SCHEME. react-markdown 10.1.0's default `urlTransform`
 *    keeps only `http`, `https`, `irc`, `ircs`, `mailto`, `xmpp` and relative
 *    URLs, and replaces anything else (`javascript:`, `data:`) with an empty
 *    string. An empty string would still render `<a href="">`, which is
 *    clickable and reloads the page, so `SafeLink` below renders a link with no
 *    surviving `href` as its text alone.
 * 3. NO IMAGES. `disallowedElements={["img"]}` is set explicitly, because the
 *    URL transform allows an ordinary `https` image, and an external image in
 *    a rendered resume is a tracking beacon that fires on every view.
 *
 * THE ONLY PROP IS THE MARKDOWN TEXT. There is no `components`, `urlTransform`,
 * `rehypePlugins` or `skipHtml` passthrough, so no caller can opt back into any
 * of the three. A new need is a change to this file, reviewed as one.
 *
 * A SERVER COMPONENT, never shipped to the browser (spec 0024, invariant 5).
 * It has no `"use client"`, and nothing in a client component imports it: the
 * resume editor's conflict pane shows the newer version as raw text on
 * purpose, so it has no reason to.
 */

interface MarkdownTextProps {
  /** The markdown source, rendered exactly as stored. */
  readonly source: string;
}

/**
 * Headings shift so the rendered text never adds a second `h1`.
 *
 * The page embedding the text owns its `h1` (on `/resume` that is `COPY-14`),
 * so a `#` in the source renders as an `h2`, the same level as the `##`
 * sections the profile seed writes. Deeper levels keep their own number, which
 * leaves the page's outline with exactly one `h1` whatever the reader typed.
 */
function heading(level: 2 | 3 | 4 | 5 | 6, className: string) {
  const Tag = `h${level}` as const;

  return function RenderedHeading({ children }: { children?: ReactNode }) {
    return <Tag className={className}>{children}</Tag>;
  };
}

/**
 * A link, or its text alone when the URL transform refused the address.
 *
 * `nofollow ugc` because the address is text the reader typed, and
 * `noreferrer` so following it does not tell the destination which page of
 * this app it came from.
 */
function SafeLink({ href, children }: ComponentProps<"a">) {
  if (href === undefined || href === "") return <span>{children}</span>;

  return (
    <a
      href={href}
      rel="nofollow ugc noreferrer"
      className="text-primary-800 underline underline-offset-4 hover:text-primary-900"
    >
      {children}
    </a>
  );
}

/**
 * The element map. Styling only: every entry renders the element it replaces
 * (bar the heading shift above), so the safety rules stay the three at the top.
 *
 * Tailwind's preflight strips list markers and heading sizes, so each element
 * restores what a reader expects from formatted text, on the design system's
 * own tokens rather than a prose plugin this project has not installed.
 */
const COMPONENTS: Components = {
  h1: heading(2, "mt-8 font-sans text-h3 font-semibold text-ink first:mt-0"),
  h2: heading(2, "mt-8 font-sans text-h3 font-semibold text-ink first:mt-0"),
  h3: heading(3, "mt-6 font-sans text-body font-semibold text-ink first:mt-0"),
  h4: heading(4, "mt-6 font-sans text-body font-semibold text-ink first:mt-0"),
  h5: heading(5, "mt-6 font-sans text-body font-medium text-ink first:mt-0"),
  h6: heading(6, "mt-6 font-sans text-body font-medium text-ink first:mt-0"),
  p: ({ children }) => (
    <p className="mt-3 max-w-[65ch] font-sans text-body text-ink first:mt-0">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="mt-3 list-disc pl-6 font-sans text-body text-ink first:mt-0">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mt-3 list-decimal pl-6 font-sans text-body text-ink first:mt-0">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="mt-1 max-w-[65ch]">{children}</li>,
  a: SafeLink,
  blockquote: ({ children }) => (
    <blockquote className="mt-3 border-l-2 border-line pl-4 text-secondary first:mt-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-line" />,
  code: ({ children }) => (
    <code className="font-mono text-small text-secondary">{children}</code>
  ),
};

/** Renders markdown text as formatted, safe output (spec 0024, AC-5, AC-13). */
export function MarkdownText({ source }: MarkdownTextProps) {
  return (
    <div className="flex flex-col">
      <Markdown
        remarkPlugins={[remarkGfm]}
        disallowedElements={["img"]}
        components={COMPONENTS}
      >
        {source}
      </Markdown>
    </div>
  );
}
