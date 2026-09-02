import { notFound } from "next/navigation";

import { env } from "@/env";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Heading } from "@/components/ui/heading";
import {
  CheckIcon,
  ExternalLinkIcon,
  GapIcon,
  GitHubIcon,
  GoogleIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { MatchBar } from "@/components/ui/match-bar";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { EntryHeader } from "@/features/entry-page/entry-header";
import { MONTH_OPTIONS } from "@/features/profile/calendar";

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

/**
 * The four remote preference values, copied from `public.job_preference`'s own
 * check constraint. Spec 0010's own list is the one the action parses against;
 * this page only needs something real to render.
 */
const REMOTE_OPTIONS = [
  { value: "no_preference", label: "No preference" },
  { value: "on_site", label: "On site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
] as const;

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
    <>
      {/*
       * SPEC 0008, AC-5a: the header, with an EMPTY navigation slot. The entry
       * page's in page anchors must not travel here, because none of those
       * sections exists on this page and a link that cannot work is forbidden.
       */}
      <EntryHeader navigation="none" />

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
            Three weights exist so the page can say what matters. This one is
            the widest, the section above it the tightest.
          </Text>
        </Section>
        {/*
         * SPEC 0010, AC-17. The four form components feature 9 adds, at every
         * variant, so the keyboard, focus, contrast and responsive passes cover
         * them the same way spec 0005's own inventory is covered.
         *
         * `paper` WITH A HAIRLINE, and both halves are deliberate. It shares
         * `paper` with the section above it, so spec 0005's adjacency rule
         * asks for the divider. And `paper` is the ground these controls
         * actually sit on in the product: every profile form is inside a flat
         * `Card`, which takes `paper` too. Proving them on `sunken` would
         * measure a combination nothing ships, and it measures worse:
         * `--muted` reads 4.42:1 there against 4.74:1 on paper, so the pass
         * would fail on a surface that does not exist.
         *
         * Nothing here posts anywhere: the controls are rendered outside a
         * form on purpose, because this page proves appearance and keyboard
         * behaviour, not a write path.
         */}
        <Section weight="standard" background="paper" divider="hairline">
          <Text variant="eyebrow">Spec 0010, form controls</Text>
          <Heading level={2} className="mt-2">
            Field, Input, Textarea, Select
          </Heading>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Field id="preview-name" label="Full name">
              <Input
                id="preview-name"
                name="preview-name"
                defaultValue="Ada Lovelace"
                maxLength={200}
                required
                autoComplete="name"
              />
            </Field>

            <Field id="preview-location" label="Location" optional>
              <Input
                id="preview-location"
                name="preview-location"
                placeholder="Berlin"
                autoComplete="address-level2"
              />
            </Field>

            <Field id="preview-name-invalid" label="Full name">
              <Input
                id="preview-name-invalid"
                name="preview-name-invalid"
                defaultValue=""
                error="Enter your name."
                required
              />
            </Field>

            <Field id="preview-disabled" label="A control you cannot edit">
              <Input
                id="preview-disabled"
                name="preview-disabled"
                defaultValue="Locked"
                disabled
              />
            </Field>

            <Field
              id="preview-summary"
              label="Summary"
              optional
              className="lg:col-span-2"
            >
              <Textarea
                id="preview-summary"
                name="preview-summary"
                rows={4}
                maxLength={4000}
                defaultValue="Backend engineer, ten years, mostly Go and Postgres."
              />
            </Field>

            <Field
              id="preview-skills"
              label={
                <>
                  Skills{" "}
                  <span className="font-normal text-muted">one per line</span>
                </>
              }
            >
              <Textarea
                id="preview-skills"
                name="preview-skills"
                rows={4}
                defaultValue={"Go\nPostgreSQL\nTerraform"}
              />
            </Field>

            <Field id="preview-skills-invalid" label="Skills, with an error">
              <Textarea
                id="preview-skills-invalid"
                name="preview-skills-invalid"
                rows={4}
                defaultValue={"React\nreact"}
                error="React is listed twice. Remove one of them."
              />
            </Field>

            <Field id="preview-remote" label="Remote preference">
              <Select
                id="preview-remote"
                name="preview-remote"
                options={REMOTE_OPTIONS}
                defaultValue="hybrid"
              />
            </Field>

            <Field id="preview-ended" label="Ended" optional>
              <Select
                id="preview-ended"
                name="preview-ended"
                options={MONTH_OPTIONS}
                emptyLabel="Still there"
              />
            </Field>

            <Field id="preview-remote-invalid" label="Remote preference">
              <Select
                id="preview-remote-invalid"
                name="preview-remote-invalid"
                options={REMOTE_OPTIONS}
                error="Choose one of the four."
              />
            </Field>

            <Field
              id="preview-select-disabled"
              label="A choice you cannot make"
            >
              <Select
                id="preview-select-disabled"
                name="preview-select-disabled"
                options={REMOTE_OPTIONS}
                defaultValue="remote"
                disabled
              />
            </Field>
          </div>
        </Section>
      </main>
    </>
  );
}
