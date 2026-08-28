import { notFound } from "next/navigation";

import { env } from "@/env";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Heading } from "@/components/ui/heading";
import {
  CheckIcon,
  ExternalLinkIcon,
  GapIcon,
  GitHubIcon,
  GoogleIcon,
} from "@/components/ui/icons";
import { MatchBar } from "@/components/ui/match-bar";
import { Section } from "@/components/ui/section";
import { Text } from "@/components/ui/text";

/** Stands in for the 116 by 23 pixel Adzuna block feature 11 supplies. */
function AttributionPlaceholder() {
  return (
    <span className="inline-flex h-[23px] w-[116px] items-center justify-center rounded-sm border border-dashed border-line font-mono text-[10px] text-muted">
      116 × 23
    </span>
  );
}

const MATCHED = [
  "Go",
  "PostgreSQL",
  "gRPC",
  "Kubernetes",
  "Terraform",
  "CI/CD",
];
const MISSING = ["Airflow", "Kafka"];

export default function UiPreviewPage() {
  /**
   * Not product surface. This page exists so the accessibility and responsive
   * passes spec 0005 requires (AC-13, AC-14) have something real to run
   * against, and so `/check verify` and `/test` can re-run them later. It reads
   * no session and touches no data, but a design system preview is still not
   * something to serve from the deployed product, so it renders only where
   * `UI_PREVIEW_ENABLED` is explicitly true and 404s everywhere else.
   *
   * The variable defaults to false in `src/env.ts`, so production, which never
   * sets it, is blocked by absence rather than by a label a build tool chooses.
   */
  if (!env.UI_PREVIEW_ENABLED) {
    notFound();
  }

  return (
    <main>
      <Section weight="generous" background="paper">
        <Text variant="eyebrow">Spec 0005</Text>
        <Heading level={1} className="mt-3">
          Design system preview
        </Heading>
        <Text variant="body" className="mt-4">
          Every base component at every variant, on one page, so the keyboard,
          focus, contrast and responsive passes have something real to run
          against.
        </Text>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button variant="primary">Primary action</Button>
          <Button variant="secondary">Secondary action</Button>
          <Button variant="tertiary" href="/">
            Tertiary link
          </Button>
          <Button variant="tertiary" href="https://example.com" external>
            External posting
          </Button>
          <Button variant="secondary" size="sm" disabled>
            Disabled
          </Button>
        </div>
      </Section>

      <Section weight="standard" background="sunken" divider="none">
        <Text variant="eyebrow">Containers, and the 60/40 grid</Text>
        <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-split">
          <Card tone="elevated" as="article">
            <Card.Header>
              <Text variant="eyebrow">Northwind Labs</Text>
              <Heading level={3}>Senior Backend Engineer</Heading>
              <Text variant="monoLabel" as="span">
                Berlin · Hybrid · €92k–118k · 4d ago
              </Text>
            </Card.Header>
            <Card.Body>
              <div className="flex items-center justify-between gap-4">
                <Text variant="eyebrow" as="span">
                  Your match
                </Text>
                <span className="rounded bg-accent-300 px-2 py-0.5 font-mono text-small font-semibold text-ink">
                  6 / 8
                </span>
              </div>
              <MatchBar matched={6} total={8} className="mt-3" />
              <Text variant="eyebrow" as="p" className="mt-5">
                Matched
              </Text>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MATCHED.map((skill) => (
                  <Chip key={skill} state="matched">
                    {skill}
                  </Chip>
                ))}
              </div>
              <Text variant="eyebrow" as="p" className="mt-4">
                Missing
              </Text>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MISSING.map((skill) => (
                  <Chip key={skill} state="missing">
                    {skill}
                  </Chip>
                ))}
              </div>
              <ul className="mt-3 space-y-1">
                <Text variant="monoData" as="li">
                  Airflow: nice to have, not core to this backend role.
                </Text>
                <Text variant="monoData" as="li">
                  Kafka: named once in the posting.
                </Text>
              </ul>
            </Card.Body>
            <Card.Footer attribution={<AttributionPlaceholder />}>
              <Button
                variant="tertiary"
                href="https://example.com/posting"
                external
              >
                Apply on the real posting
              </Button>
            </Card.Footer>
          </Card>

          <Card tone="flat" as="article">
            <Card.Header>
              <Text variant="eyebrow">A second proportion</Text>
              <Heading level={3}>Flat idiom, 8 of 11</Heading>
            </Card.Header>
            <Card.Body>
              <MatchBar matched={8} total={11} />
              <Text variant="body" className="mt-4">
                The same component at a different ratio. Neither bar carries a
                hand written cell count, which is the whole point of AC-7.
              </Text>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button variant="secondary" size="sm">
                  <GitHubIcon />
                  Continue with GitHub
                </Button>
                <Button variant="secondary" size="sm">
                  <GoogleIcon />
                  Continue with Google
                </Button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Chip state="status">Soon</Chip>
                <span className="inline-flex items-center gap-2 text-muted">
                  <CheckIcon />
                  <GapIcon />
                  <ExternalLinkIcon />
                  <Text variant="muted" as="span">
                    the five icons
                  </Text>
                </span>
              </div>
            </Card.Body>
            <Card.Footer>
              <Button variant="tertiary" href="/">
                No attribution on this one
              </Button>
            </Card.Footer>
          </Card>
        </div>
      </Section>

      <Section weight="compact" background="sunken" divider="hairline">
        <Text variant="eyebrow">Adjacency rule</Text>
        <Heading level={2} className="mt-2">
          Same background, so a hairline
        </Heading>
        <Text variant="body" className="mt-3">
          This section shares `sunken` with the one above it, so it takes the
          divider. The next section changes background, so it takes none.
        </Text>
      </Section>

      <Section weight="generous" background="paper" divider="none">
        <Text variant="eyebrow">Rhythm</Text>
        <Heading level={2} className="mt-2">
          Generous, and no divider
        </Heading>
        <Text variant="body" className="mt-3">
          Three weights exist so the page can say what matters. This one is the
          widest, the section above it the tightest.
        </Text>
      </Section>
    </main>
  );
}
