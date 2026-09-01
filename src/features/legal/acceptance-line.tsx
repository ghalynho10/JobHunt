import { Text } from "@/components/ui/text";

import { InlineLink } from "./legal-document";

/**
 * The line under the provider forms on `/sign-in` (spec 0009, AC-19).
 *
 * IT LIVES WITH THE NOTICES, NOT WITH THE SIGN IN FORMS, and is composed by the
 * page the way that page already composes `EntryHeader` from another feature.
 * The reason is that this sentence is the acceptance mechanism: AC-16 makes
 * continued use the way the current version is accepted, and this line is where
 * a person is told so. If the terms change shape, this sentence changes with
 * them, and it should sit beside them when that happens.
 *
 * STATIC COPY, NOT A CHECKBOX, and nothing is recorded. A checkbox needs client
 * state, which `/sign-in` forbids, and recording WHICH version somebody agreed
 * to needs a `profile` row that does not exist until feature 9. Spec 0009
 * records that gap rather than papering over it: today nobody knows who agreed
 * to which version, and a checkbox that stored nothing would only make the
 * page look like it did.
 */

const BEFORE = "By continuing you agree to the ";
const BETWEEN = " and the ";
const AFTER = ".";

/** Tells somebody what signing in commits them to, and links both documents. */
export function LegalAcceptanceLine() {
  return (
    <Text variant="muted">
      {BEFORE}
      <InlineLink href="/terms">Terms of use</InlineLink>
      {BETWEEN}
      <InlineLink href="/privacy">Privacy notice</InlineLink>
      {AFTER}
    </Text>
  );
}
