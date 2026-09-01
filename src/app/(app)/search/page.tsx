import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import { AppHeader } from "@/features/app-shell/app-header";

/**
 * Search (spec 0008, AC-1, AC-2).
 *
 * A REAL ROUTE WITH A PLACEHOLDER BODY, not a stub. Features 11 and 12 fill it
 * in; what this feature owes them is a route that exists, sits under the shell,
 * and is reachable from the navigation, so their specs start from something
 * rather than inventing a shell of their own.
 *
 * IT IS AN ORDINARY EXPECTED STATE, NOT A FAILURE (AC-2). No `role="alert"`, no
 * red border: nothing here went wrong. The sentence also avoids any phrasing
 * that becomes FALSE once the feature lands, which is the trap spec 0007 AC-16
 * had to delete from the sign in band. Saying a route is not built yet is true
 * today and simply gets replaced.
 */
export default function SearchPage() {
  return (
    <>
      <AppHeader current="search" />

      <main className="flex-1">
        <Section weight="standard">
          <Heading level={1}>Search</Heading>

          {/* `COPY-1`, the engineer's, used verbatim. */}
          <Text className="text-muted mt-3">
            Search comes next. This is where real listings will appear, ranked,
            with the reasoning shown.
          </Text>
        </Section>
      </main>
    </>
  );
}
