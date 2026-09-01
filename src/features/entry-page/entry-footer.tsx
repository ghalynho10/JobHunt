import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { Text } from "@/components/ui/text";

/**
 * The entry page's footer (spec 0006, AC-13).
 *
 * THE CENTRE SLOT NOW HOLDS THE TWO LEGAL LINKS (spec 0009, AC-18). It was
 * left empty by feature 6 and reserved for exactly this. The prototype had put
 * "Built with Next.js, TypeScript, and Tailwind" in the most privileged
 * position under `justify-between`, which is a stack brag aimed at the author
 * rather than the reader (the composition review's Weakness #9); what sits
 * there instead is the one thing a reader might actually go looking for.
 *
 * THIS IS THE ONLY PLACE THE TWO NOTICES ARE REACHABLE FROM EVERY PUBLIC PAGE,
 * so the slot is not free again. `/sign-in` also names them, but in a sentence
 * about what signing in means rather than as navigation.
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

        {/*
         * A real `nav` with a name, because a list of two links to other pages
         * is navigation, and a landmark with no name is indistinguishable from
         * the header's in a landmark list.
         */}
        <nav aria-label="Legal" className="flex items-center gap-6">
          <Button variant="tertiary" size="sm" href="/terms">
            Terms
          </Button>
          <Button variant="tertiary" size="sm" href="/privacy">
            Privacy
          </Button>
        </nav>

        <Text variant="muted" className="text-small">
          © Ghaly Nicolas Jules
        </Text>
      </div>
    </footer>
  );
}
