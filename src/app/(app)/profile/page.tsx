import { Button } from "@/components/ui/button";
import { Heading } from "@/components/ui/heading";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";
import { AppHeader } from "@/features/app-shell/app-header";

/**
 * Profile (spec 0008, AC-1, AC-2).
 *
 * WHERE A FIRST TIME VISITOR LANDS. The landing rule sends anybody with no
 * profile row here, so this is the first screen most people see after signing
 * in. Feature 9 builds the form; this is the route it builds into.
 *
 * IT CARRIES THE ONLY LINK TO `/applications` (AC-1). That route is deliberately
 * not in the navigation, and this link is what keeps it from being reachable
 * only by typing its URL.
 */
export default function ProfilePage() {
  return (
    <>
      <AppHeader current="profile" />

      <main className="flex-1">
        <Section weight="standard">
          <Heading level={1}>Profile</Heading>

          {/* `COPY-2`, the engineer's, used verbatim. */}
          <Text className="text-muted mt-3">
            Your profile lives here. Once you fill it in, search has something
            to rank against.
          </Text>

          <div className="mt-8">
            {/* `COPY-6`, the mock up's own wording for this link. */}
            <Button variant="tertiary" href="/applications">
              Tracked applications
            </Button>
          </div>
        </Section>
      </main>
    </>
  );
}
