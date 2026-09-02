import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

import { CONTROLS, HEADINGS } from "./copy";
import { IdentityForm } from "./identity-form";
import { SectionCard } from "./section-card";
import type { Profile } from "./queries";

/**
 * Personal details, as a view or as its own edit form (spec 0010, AC-2, AC-4).
 *
 * THE VIEW SHOWS ONLY THE COLUMNS `public.profile` ACTUALLY HAS (AC-18):
 * `full_name`, `location` and `summary`. There is no role and no years of
 * experience field, because there are no columns for them, and a field with
 * nowhere to go is a promise the product cannot keep.
 */

interface IdentitySectionProps {
  readonly profile: Profile;
  readonly editing: boolean;
}

export function IdentitySection({ profile, editing }: IdentitySectionProps) {
  if (editing) {
    return (
      <SectionCard heading={HEADINGS.identity}>
        <IdentityForm
          fullName={profile.full_name}
          location={profile.location}
          summary={profile.summary}
          existing
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      heading={HEADINGS.identity}
      control={
        /**
         * The accessible name says which section it edits. Four "Edit" links on
         * one page are four identical names in a screen reader's list of links
         * without it, and `Button`'s `label` exists for exactly this.
         */
        <Button
          variant="tertiary"
          size="sm"
          href="/profile?edit=identity"
          label="Edit personal details"
        >
          {CONTROLS.edit}
        </Button>
      }
    >
      <dl className="flex flex-col gap-4">
        <div>
          <Text as="dt" variant="eyebrow">
            Name
          </Text>
          <Text as="dd" className="mt-1">
            {profile.full_name}
          </Text>
        </div>

        <div>
          <Text as="dt" variant="eyebrow">
            Location
          </Text>
          <Text as="dd" className="mt-1">
            {/*
             * Absent is said out loud rather than rendered as an empty line. A
             * blank where a value would be reads as a value that is blank.
             */}
            {profile.location ?? "Not set yet."}
          </Text>
        </div>

        <div>
          <Text as="dt" variant="eyebrow">
            Summary
          </Text>
          <Text as="dd" className="mt-1 whitespace-pre-line">
            {profile.summary ?? "Not set yet."}
          </Text>
        </div>
      </dl>
    </SectionCard>
  );
}
