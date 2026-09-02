import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

import { CONTROLS, HEADINGS, PREFERENCES_NOT_SET } from "./copy";
import { PreferencesForm } from "./preferences-form";
import { SectionCard } from "./section-card";
import type { Preferences } from "./queries";

/**
 * Search preferences, as a view or as its own edit form (spec 0010, AC-9,
 * AC-10).
 *
 * ABSENT IS A REAL STATE, NOT A ROW OF DEFAULTS (invariant 5). Until the section
 * is explicitly saved once, no `job_preference` row exists and the view reads
 * `COPY-3`. Rendering "No preference" and a blank pay instead would show the
 * reader a set of answers they never gave, and the product would then rank
 * against them.
 */

/** The four stored values, with the words a reader sees. */
const REMOTE_LABELS: Readonly<Record<string, string>> = {
  on_site: "On site",
  hybrid: "Hybrid",
  remote: "Remote",
  no_preference: "No preference",
};

interface PreferencesSectionProps {
  /** `undefined` until the section has been saved once (AC-10). */
  readonly preferences: Preferences | undefined;
  readonly editing: boolean;
}

export function PreferencesSection({
  preferences,
  editing,
}: PreferencesSectionProps) {
  if (editing) {
    return (
      <SectionCard heading={HEADINGS.preferences}>
        <PreferencesForm
          desiredTitles={(preferences?.desired_titles ?? []).join("\n")}
          desiredLocations={(preferences?.desired_locations ?? []).join("\n")}
          /**
           * The column's own default when no row exists yet. It is the form's
           * starting selection, not a stored answer: nothing is written until
           * this form is submitted, which is what keeps AC-10 true.
           */
          remotePreference={preferences?.remote_preference ?? "no_preference"}
          minimumPay={
            preferences?.minimum_pay === undefined
              ? ""
              : preferences.minimum_pay.toFixed(2)
          }
          minimumPayCurrency={preferences?.minimum_pay_currency ?? ""}
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      heading={HEADINGS.preferences}
      control={
        <Button
          variant="tertiary"
          size="sm"
          href="/profile?edit=preferences"
          label="Edit search preferences"
        >
          {CONTROLS.edit}
        </Button>
      }
    >
      {preferences === undefined ? (
        /* `COPY-3`, the engineer's, used verbatim. */
        <Text className="text-muted">{PREFERENCES_NOT_SET}</Text>
      ) : (
        <dl className="flex flex-col gap-4">
          <div>
            <Text as="dt" variant="eyebrow">
              Job titles
            </Text>
            <Text as="dd" className="mt-1">
              {list(preferences.desired_titles)}
            </Text>
          </div>

          <div>
            <Text as="dt" variant="eyebrow">
              Locations
            </Text>
            <Text as="dd" className="mt-1">
              {list(preferences.desired_locations)}
            </Text>
          </div>

          <div>
            <Text as="dt" variant="eyebrow">
              Where you want to work
            </Text>
            <Text as="dd" className="mt-1">
              {REMOTE_LABELS[preferences.remote_preference] ??
                preferences.remote_preference}
            </Text>
          </div>

          <div>
            <Text as="dt" variant="eyebrow">
              Lowest pay you would take
            </Text>
            {/*
             * `monoLabel` is the register for a literal the product measured,
             * which a salary is. Stored raw as `numeric(12, 2)` and formatted
             * to its own scale here, beside the currency the table's paired
             * constraint guarantees is there.
             */}
            <Text as="dd" variant="monoLabel" className="mt-1">
              {preferences.minimum_pay === undefined ||
              preferences.minimum_pay_currency === undefined
                ? "Not set yet."
                : `${preferences.minimum_pay.toFixed(2)} ${preferences.minimum_pay_currency}`}
            </Text>
          </div>
        </dl>
      )}
    </SectionCard>
  );
}

/**
 * A stored list as one readable line.
 *
 * An empty list says so rather than rendering nothing, because a blank where a
 * value would be reads as a value that is blank.
 */
function list(values: readonly string[]): string {
  return values.length === 0 ? "Not set yet." : values.join(", ");
}
