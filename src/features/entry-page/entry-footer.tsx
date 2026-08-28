import { Logo } from "@/components/ui/logo";
import { Text } from "@/components/ui/text";

/**
 * The entry page's footer (spec 0006, AC-13).
 *
 * THE CENTRE SLOT IS EMPTY ON PURPOSE. The prototype put "Built with Next.js,
 * TypeScript, and Tailwind" in the most privileged position under
 * `justify-between`, which is a stack brag aimed at the author rather than the
 * reader (the composition review's Weakness #9). It is removed, and the slot is
 * left free for feature 21, whose own `Done when` requires Terms and Privacy to
 * be linked from this page.
 *
 * NO TOP BORDER. The footer follows the dark sign in band, so the boundary is
 * already carried by a background change and a hairline would double state it,
 * per spec 0005's adjacency rule. AC-3 allows exactly one hairline on this
 * page and it is not this one.
 */
export function EntryFooter() {
  return (
    <footer className="bg-paper">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        {/* Standing alone with nothing else naming it, so here the logo IS the name. */}
        <Logo
          variant="lockup"
          label="JobHunt"
          className="text-primary-800 h-6 w-auto"
        />

        <Text variant="muted" className="text-small">
          © Ghaly Nicolas Jules
        </Text>
      </div>
    </footer>
  );
}
