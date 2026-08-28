import type { ReactElement, ReactNode } from "react";

/**
 * A tiny walker over the React element trees the base components return.
 *
 * WHY THIS EXISTS INSTEAD OF A RENDERER. Spec 0004 pins the unit project to the
 * `node` environment and records that jsdom arrives with the first test that
 * genuinely needs a browser. Nothing in spec 0005 does: every base component is
 * a server component with no state, no effects and no event handlers, so calling
 * it is the whole of its behaviour and the element it returns is the whole of
 * its output. Adding jsdom plus a renderer to inspect a plain object would buy
 * nothing and would break the project's just in time install rule.
 *
 * What a browser IS needed for (computed font sizes, focus rings, media
 * queries, layout, overflow) is not faked here. Those live in this feature's
 * `verify.md` and are proved by `/check verify` against the running app.
 */

/** True for a React element, as opposed to a string, number, or nullish child. */
function isElement(node: ReactNode): node is ReactElement {
  return typeof node === "object" && node !== null && "type" in node;
}

/**
 * Every element in the tree, parents before children, including the root.
 * Fragments are walked through rather than reported, since a caller never sees
 * one; strings, numbers and nullish children are skipped.
 */
export function flatten(node: ReactNode): readonly ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (!isElement(node)) return [];

  const props = node.props as { readonly children?: ReactNode };
  const descendants = flatten(props.children);

  return typeof node.type === "symbol" ? descendants : [node, ...descendants];
}

/** Every element in the tree whose type is `type`, by identity. */
export function findAllByType(
  node: ReactNode,
  type: unknown,
): readonly ReactElement[] {
  return flatten(node).filter((element) => element.type === type);
}

/** The single element of that type, or `undefined`. Throws if there are several. */
export function findByType(
  node: ReactNode,
  type: unknown,
): ReactElement | undefined {
  const found = findAllByType(node, type);
  if (found.length > 1) {
    throw new Error(`Expected at most one match, found ${found.length}.`);
  }
  return found[0];
}

/** The `className` of an element, split into individual classes. */
export function classesOf(node: ReactNode): readonly string[] {
  if (!isElement(node)) return [];
  const { className } = node.props as { readonly className?: string };
  return className === undefined ? [] : className.split(/\s+/).filter(Boolean);
}

/** All text a caller would read, in order. */
export function textOf(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isElement(node)) return "";
  return textOf((node.props as { readonly children?: ReactNode }).children);
}
