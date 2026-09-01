import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import { AppHeader } from "@/features/app-shell/app-header";

/**
 * Applications (spec 0008, AC-1, AC-2).
 *
 * NOT IN THE NAVIGATION, ON PURPOSE. It is reached from the link on `/profile`
 * (`COPY-6`), per the settled decision in `docs/app-shell-direction.md`: two
 * navigation items is the whole shell, and a third would be the beginning of a
 * menu. It is still linked from somewhere, so no product route here is
 * reachable only by typing its URL.
 */
export default function ApplicationsPage() {
  return (
    <>
      <AppHeader />

      <main className="flex-1">
        <Section weight="standard">
          <Heading level={1}>Applications</Heading>

          {/* `COPY-3`, the engineer's, used verbatim. */}
          <Text className="text-muted mt-3">
            Every job you apply to will be recorded here, so you can see what
            you sent and when.
          </Text>
        </Section>
      </main>
    </>
  );
}
